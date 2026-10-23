import { evaluateAuthoritativePolicyDecision } from '$lib/access/index.server';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarAvailabilityPorts
} from './calendarPolicy.server';
import { requirePersonnelCalendarRoster } from './calendarScope.server';
import type { AvailabilityImportInput, AvailabilityImportResult } from './contracts';

const OVERLAP_CHANGED = 'This row now overlaps the calendar. Import the file again to choose what happens.';
const REPLACED_CHANGED = 'An entry this row replaces changed since you reviewed it. Import the file again.';

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

	const dates = entries.flatMap((entry) => [entry.startDate, entry.endDate]).sort();
	const saved = allowed.size
		? await ctx.calendarAvailability.listOverlapping({
				rangeStart: dates[0],
				rangeEnd: dates.at(-1)!,
				personnelIds: [...allowed]
			})
		: [];

	const errors: AvailabilityImportResult['errors'] = [];
	const accepted: { index: number; entry: AvailabilityImportInput['entries'][number] }[] = [];
	entries.forEach((entry, index) => {
		const refuse = (message: string) => errors.push({ index, message });
		if (!allowed.has(entry.personnelId)) return refuse('This person is not on a roster you can change.');
		const overlapping = saved.filter(
			(other) =>
				other.personnelId === entry.personnelId && other.startDate <= entry.endDate && other.endDate >= entry.startDate
		);
		if (overlapping.some((other) => sameDates(other, entry))) return refuse('Already on the calendar.');
		const unreviewed = overlapping.filter(
			(other) =>
				!entry.alongside?.some((partner) => sameDates(partner, other)) &&
				!(entry.overlap === 'replace' && entry.replaces.some((replaced) => replaced.id === other.id))
		);
		if (entry.overlap !== 'keep' && unreviewed.length) return refuse(OVERLAP_CHANGED);
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
			replaces: entry.overlap === 'replace' ? entry.replaces : []
		}))
	);
	for (const position of stale) errors.push({ index: accepted[position].index, message: REPLACED_CHANGED });
	errors.sort((a, b) => a.index - b.index);
	if (inserted || deleted)
		await ctx.audit.log({
			action: 'availability.bulk_imported',
			resourceType: 'availability',
			details: { added: inserted, removed: deleted }
		});
	return { added: inserted, removed: deleted, errors };
}

function sameDates(
	a: { statusTypeId: string; startDate: string; endDate: string },
	b: { statusTypeId: string; startDate: string; endDate: string }
) {
	return a.statusTypeId === b.statusTypeId && a.startDate === b.startDate && a.endDate === b.endDate;
}
