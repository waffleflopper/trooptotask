import { error } from '@sveltejs/kit';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import { statusEffectPreviewInput } from './calendarPersistenceMapping.server';
import type { StatusEffectChange } from './contracts';
import { loadRosterFacts, requireDeviceDate, type RosterSettingsPorts } from './rosterSettingsOperations.server';
import {
	countChanges,
	simulateRoster,
	type RosterEffect,
	type RosterFacts,
	type RosterRun,
	type TrackId
} from './roster/rosterEngine';

const action = CALENDAR_POLICY_ACTIONS.configureStatusTypes;
const resource = { kind: 'organization' } as const;
const LAST_DAY = '9999-12-31';

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
			.filter((type) => type.assignTo === 'personnel')
			.map(async (type) => {
				const form = await ctx.calendarCatalogs.findOpenRosterForm(type.id);
				if (!form) return [];
				// Planned days count too, so the form is read through its last stored duty day.
				const stored = await ctx.calendarAssignments.listRosterDetailDays(type.id, {
					from: form.startsOn,
					through: LAST_DAY
				});
				const through = [today, stored.at(-1)?.date ?? today].reduce((a, b) => (a > b ? a : b));
				if (through < form.startsOn) return [];
				return changesOn(await loadRosterFacts(ctx, type, form, today, through), id, rosterEffect);
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
	const keyOf = (personId: string, track: TrackId) => `${personId}:${track}`;
	const counts = (run: RosterRun) =>
		new Map(
			run.current?.flatMap(({ track, counts }) => counts.map((entry) => [keyOf(entry.personId, track), entry.count]))
		);
	const oldCounts = counts(oldRun);
	const newCounts = counts(newRun);

	// Everyone whose number today or any day on the form changes, including people who have left the pool.
	const changed = new Map<string, { personId: string; track: TrackId; earlier: Set<string>; later: Set<string> }>();
	const entry = (personId: string, track: TrackId) => {
		const key = keyOf(personId, track);
		if (!changed.has(key)) changed.set(key, { personId, track, earlier: new Set(), later: new Set() });
		return changed.get(key)!;
	};
	for (const { personId, track, date } of countChanges(oldRun, newRun)) {
		entry(personId, track)[date < before.today ? 'earlier' : 'later'].add(date);
	}
	for (const [key, to] of newCounts) {
		const from = oldCounts.get(key);
		if (from === undefined || from === to) continue;
		const [personId, track] = key.split(':') as [string, TrackId];
		entry(personId, track);
	}

	const people = new Map(before.people.map((person) => [person.id, person]));
	return [...changed].map(([key, { personId, track, earlier, later }]) => {
		const person = people.get(personId)!;
		const from = oldCounts.get(key);
		const to = newCounts.get(key);
		const days = earlier.size + later.size;
		return {
			assignmentTypeId: before.type.id,
			rosterName: before.type.name,
			track,
			personId,
			person: `${person.rank} ${person.lastName}`,
			change:
				from !== undefined && to !== undefined && from !== to
					? { kind: 'number', from, to }
					: { kind: later.size === 0 ? 'earlier' : 'days', days }
		};
	});
}
