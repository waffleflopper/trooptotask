import {
	normalizePoolRules,
	type AssignmentType,
	type RosterExcusalInput,
	type RosterSettingsInput
} from '$features/calendar/contracts';
import type { PoolRules, WeekendMode } from '$features/calendar/roster/rosterTypes';

/** A rule row the editor has not added is null. A rank range has an empty end until both are picked. */
export interface RosterDraft {
	mode: 'everyone' | 'match';
	rank: { from: string; to: string } | null;
	mos: string[] | null;
	role: string[] | null;
	groupIds: string[] | null;
	excusals: RosterExcusalInput[];
	weekendMode: WeekendMode;
}

export function rosterDraftFrom(type?: Pick<AssignmentType, 'poolRules' | 'weekendMode' | 'excusals'>): RosterDraft {
	const rules = type?.poolRules ?? null;
	const listed = (values: readonly string[] | undefined) => (values?.length ? [...values] : null);
	return {
		mode: rules ? 'match' : 'everyone',
		rank: rules?.rank ? { ...rules.rank } : null,
		mos: listed(rules?.mos),
		role: listed(rules?.role),
		groupIds: listed(rules?.groupIds),
		excusals: (type?.excusals ?? []).map(({ personId, reason }) => ({ personId, reason })),
		weekendMode: type?.weekendMode ?? 'same'
	};
}

/** The rules the draft would save. A half-picked rank range and empty rows constrain nothing. */
export function draftPoolRules(draft: RosterDraft): PoolRules | null {
	if (draft.mode === 'everyone') return null;
	return normalizePoolRules({
		rank: draft.rank?.from && draft.rank.to ? { from: draft.rank.from, to: draft.rank.to } : null,
		mos: draft.mos ?? [],
		role: draft.role ?? [],
		groupIds: draft.groupIds ?? []
	});
}

/** Why the draft cannot save, or null. */
export function rosterDraftProblem(draft: RosterDraft): string | null {
	if (draft.mode === 'everyone') return null;
	if (draft.rank && (!draft.rank.from || !draft.rank.to)) return 'Pick both ends of the rank range.';
	if (!draftPoolRules(draft)) return 'Add a rule, or pick Everyone.';
	return null;
}

export function rosterSettingsFrom(draft: RosterDraft, today: string): RosterSettingsInput {
	return { poolRules: draftPoolRules(draft), weekendMode: draft.weekendMode, excusals: draft.excusals, today };
}

/** Whether saving the draft closes the open DA 6 form. */
export function rosterRulesChanged(type: Pick<AssignmentType, 'poolRules' | 'weekendMode'>, draft: RosterDraft) {
	return (
		draft.weekendMode !== type.weekendMode ||
		JSON.stringify(draftPoolRules(draft)) !== JSON.stringify(type.poolRules && normalizePoolRules(type.poolRules))
	);
}

export function rosterExcusalsChanged(type: Pick<AssignmentType, 'excusals'>, draft: RosterDraft) {
	const key = (excusals: readonly RosterExcusalInput[]) =>
		JSON.stringify(excusals.map(({ personId, reason }) => [personId, reason.trim()]).sort());
	return key(type.excusals) !== key(draft.excusals);
}
