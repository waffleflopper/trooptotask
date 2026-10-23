import { evaluateAuthoritativePolicyDecision } from '$lib/access/index.server';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarAvailabilityPorts
} from './calendarPolicy.server';
import { requirePersonnelCalendarRoster } from './calendarScope.server';
import type { AvailabilityImportInput, AvailabilityImportResult } from './contracts';

const IMPORT_STALE =
	'This row or an entry it overlaps changed since you reviewed it. Import the file again to choose what happens.';

export async function importAvailabilityEntries(
	ctx: CalendarAvailabilityPorts,
	{ entries }: AvailabilityImportInput
): Promise<AvailabilityImportResult> {
	const action = CALENDAR_POLICY_ACTIONS.manageAvailability;
	await requireCalendarPolicy(ctx, action);

	const personnelIds = [...new Set(entries.map((entry) => entry.personnelId))];
	const groups = await requirePersonnelCalendarRoster(ctx).findGroupIds(ctx.auth, personnelIds);
	const allowed = new Set<string>();
	for (const id of personnelIds) {
		if (!groups.has(id)) continue;
		const groupId = groups.get(id);
		const decision = await evaluateAuthoritativePolicyDecision(
			ctx,
			action,
			groupId ? { kind: 'group', groupId } : { kind: 'organization' }
		);
		if (decision.allowed) allowed.add(id);
	}

	const errors: AvailabilityImportResult['errors'] = [];
	const accepted: { index: number; entry: AvailabilityImportInput['entries'][number] }[] = [];
	entries.forEach((entry, index) => {
		const refuse = (message: string) => errors.push({ index, message });
		if (!allowed.has(entry.personnelId)) return refuse('This person is not on a roster you can change.');
		accepted.push({ index, entry });
	});

	if (!accepted.length) return { added: 0, removed: 0, errors };
	const { inserted, deleted, stale } = await ctx.calendarAvailability.insertReplacing(
		accepted.map(({ entry }) => ({
			personnelId: entry.personnelId,
			statusTypeId: entry.statusTypeId,
			startDate: entry.startDate,
			endDate: entry.endDate,
			note: entry.note,
			overlap: entry.overlap,
			alongside: entry.alongside,
			replaces: entry.overlap === 'replace' ? entry.replaces : []
		}))
	);
	for (const position of stale) errors.push({ index: accepted[position].index, message: IMPORT_STALE });
	errors.sort((a, b) => a.index - b.index);
	if (inserted || deleted)
		await ctx.audit.log({
			action: 'availability.bulk_imported',
			resourceType: 'availability',
			details: { added: inserted, removed: deleted }
		});
	return { added: inserted, removed: deleted, errors };
}
