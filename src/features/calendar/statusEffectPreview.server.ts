import { error } from '@sveltejs/kit';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import { statusEffectPreviewInput } from './calendarPersistenceMapping.server';
import type { StatusEffectChange } from './contracts';
import { loadRosterFacts, requireDeviceDate, type RosterSettingsPorts } from './rosterSettingsOperations.server';
import { countChanges, simulateRoster, type RosterEffect, type RosterFacts } from './roster/rosterEngine';

const action = CALENDAR_POLICY_ACTIONS.configureStatusTypes;
const resource = { kind: 'organization' } as const;

/**
 * Every number an effect change would move on each roster's open DA 6 form, one entry per person and track.
 * Authorized like the edit it previews. Closed forms are not read, because saving never recalculates them.
 */
export async function previewStatusEffect(
	ctx: RosterSettingsPorts,
	input: Record<string, unknown>
): Promise<StatusEffectChange[]> {
	const parsed = statusEffectPreviewInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { id, rosterEffect, today } = parsed.data;
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, action, resource);

	const [statusTypes, types] = await Promise.all([
		ctx.calendarCatalogs.listStatusTypes(),
		ctx.calendarCatalogs.listAssignmentTypes()
	]);
	const status = statusTypes.find((type) => type.id === id);
	if (!status) fail(404, 'That status type is no longer available.');
	if (status.rosterEffect === rosterEffect) return [];

	const lines = await Promise.all(
		types
			.filter((type) => type.assignTo === 'personnel' && !type.archivedAt)
			.map(async (type) => {
				const form = await ctx.calendarCatalogs.findOpenRosterForm(type.id);
				// A form that starts after today has no day to recalculate.
				if (!form || form.startsOn > today) return [];
				return changesOn(await loadRosterFacts(ctx, type, form, today), id, rosterEffect);
			})
	);
	return lines.flat();
}

function changesOn(before: RosterFacts, statusTypeId: string, rosterEffect: RosterEffect): StatusEffectChange[] {
	// The effect reaches a roster only through people who held the status.
	if (!before.availability.some((entry) => entry.statusTypeId === statusTypeId)) return [];
	const after: RosterFacts = {
		...before,
		statusTypes: before.statusTypes.map((type) => (type.id === statusTypeId ? { ...type, rosterEffect } : type))
	};
	const oldRun = simulateRoster(before);
	const newRun = simulateRoster(after);
	const oldCounts = new Map(
		oldRun.current?.flatMap(({ track, counts }) => counts.map((entry) => [`${entry.personId}:${track}`, entry.count]))
	);
	const earlier = new Map<string, Set<string>>();
	for (const { personId, track, date } of countChanges(oldRun, newRun)) {
		if (date >= before.today) continue;
		const key = `${personId}:${track}`;
		earlier.set(key, (earlier.get(key) ?? new Set()).add(date));
	}

	const people = new Map(before.people.map((person) => [person.id, person]));
	const lines: StatusEffectChange[] = [];
	const line = (personId: string, track: StatusEffectChange['track'], change: StatusEffectChange['change']) => {
		const person = people.get(personId)!;
		lines.push({
			assignmentTypeId: before.type.id,
			rosterName: before.type.name,
			track,
			personId,
			person: `${person.rank} ${person.lastName}`,
			change
		});
	};
	for (const { track, counts } of newRun.current ?? []) {
		for (const { personId, count } of counts) {
			const key = `${personId}:${track}`;
			const was = oldCounts.get(key);
			if (was !== undefined && was !== count) line(personId, track, { kind: 'number', from: was, to: count });
			else if (earlier.has(key)) line(personId, track, { kind: 'earlier', days: earlier.get(key)!.size });
		}
	}
	return lines;
}
