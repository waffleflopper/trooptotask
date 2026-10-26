import { z } from 'zod';
import { uuidSchema } from '$lib/utils/inputSchemas';
import { TASKING_STAFFING_MAX, type StaffingCount, type Tasking, type TaskingResponsibility } from '../taskingModel';

export type { NamedPeople, StaffingCount } from '../taskingModel';

/** A picked Person whose roster scope the reader covers. Picks outside it are only counted. */
export interface TaskingPick {
	personnelId: string;
	rank: string;
	firstName: string;
	lastName: string;
	groupId: string | null;
	mos: string;
	clinicRole: string;
	archived: boolean;
	selectedAt: string;
	/** When the pick stopped qualifying. Only an explicit keep or removal clears it; restoring the Person does not. */
	reviewSince: string | null;
}

/** One read's answer: the picks it checked and how many of them lack Availability on an execution day. */
export interface AvailabilityCoverage {
	checked: number;
	uncovered: number;
}

export const NO_STAFFING: StaffingCount = { picked: 0, needsReview: 0, outsideScope: 0 };

export interface TaskingStaffing extends StaffingCount {
	/** The staffing revision a save must name; it moves with every saved change. */
	revision: number;
	picks: TaskingPick[];
}

/** Why a pick is under review, from the roster facts as they stand now. */
export type PickReview = 'archived' | 'left_group' | 'eligible_again';

export function pickReview(pick: TaskingPick, responsibility: TaskingResponsibility): PickReview | null {
	if (pick.reviewSince === null) return null;
	if (pick.archived) return 'archived';
	if (responsibility.kind === 'group' && pick.groupId !== responsibility.groupId) return 'left_group';
	return 'eligible_again';
}

/** Someone the operator may newly pick: active and on the Tasking's roster. */
export interface StaffingCandidate {
	personnelId: string;
	rank: string;
	firstName: string;
	lastName: string;
	groupId: string | null;
	mos: string;
	clinicRole: string;
}

export function isCandidateFor(responsibility: TaskingResponsibility, person: { groupId: string | null }): boolean {
	return responsibility.kind === 'organization' || person.groupId === responsibility.groupId;
}

/** Another fact over the execution dates. An inaccessible Tasking is only "committed elsewhere". */
export type StaffingAdvisory =
	| {
			kind: 'availability';
			label: string;
			startsOn: string;
			endsOn: string;
			isConflict: boolean;
			overlapDays: number;
			executionDays: number;
	  }
	| { kind: 'tasking'; taskingId: string; title: string; startsOn: string; endsOn: string }
	| { kind: 'committed_elsewhere' };

/** Absent dates and a failed read are both different from "no conflicts". */
export type StaffingAdvisories =
	| { kind: 'no_execution' }
	| { kind: 'failed' }
	| { kind: 'loaded'; byPerson: Record<string, StaffingAdvisory[]> };

export interface StaffingPicker {
	tasking: Pick<Tasking, 'requirement' | 'execution'>;
	staffing: TaskingStaffing;
	candidates: StaffingCandidate[];
	advisories: StaffingAdvisories;
	states: Record<string, StaffingPersonState>;
}

export const personName = (person: Pick<TaskingPick, 'rank' | 'firstName' | 'lastName'>) =>
	[person.rank, `${person.lastName}, ${person.firstName}`].filter(Boolean).join(' ');

/** `RANK Last`, short enough for a chip or a toast. */
export const shortPersonName = (person: Pick<TaskingPick, 'rank' | 'lastName'>) =>
	[person.rank, person.lastName].filter(Boolean).join(' ');

/** `picked of required`, or just the picked count when nothing is required. Picks under review never count. */
export function staffingLabel(picked: number, required: number | null): string | null {
	if (required !== null) return `${picked} of ${required} picked`;
	return picked > 0 ? `${picked} picked` : null;
}

export const outsideScopeLabel = (count: number) => `${count} ${count === 1 ? 'person' : 'people'} outside your Groups`;

/** One person the picker lists: a candidate, or someone already picked who no longer is one. */
export interface PickerRow extends StaffingCandidate {
	review: PickReview | null;
}

/** Candidates plus every current pick, so an operator can see and drop a pick that stopped qualifying. */
export function pickerRows(picker: StaffingPicker, responsibility: TaskingResponsibility): PickerRow[] {
	const rows = new Map<string, PickerRow>();
	for (const pick of picker.staffing.picks)
		rows.set(pick.personnelId, {
			personnelId: pick.personnelId,
			rank: pick.rank,
			firstName: pick.firstName,
			lastName: pick.lastName,
			groupId: pick.groupId,
			mos: pick.mos,
			clinicRole: pick.clinicRole,
			review: pickReview(pick, responsibility)
		});
	for (const candidate of picker.candidates)
		if (!rows.has(candidate.personnelId)) rows.set(candidate.personnelId, { ...candidate, review: null });
	return [...rows.values()].sort(
		(a, b) =>
			a.lastName.localeCompare(b.lastName) ||
			a.firstName.localeCompare(b.firstName) ||
			a.personnelId.localeCompare(b.personnelId)
	);
}

const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length;

export const staffingSaveSchema = z
	.object({
		personnelIds: z.array(uuidSchema).max(TASKING_STAFFING_MAX).refine(uniqueIds, 'Pick each person once.'),
		keep: z.array(uuidSchema).max(TASKING_STAFFING_MAX).refine(uniqueIds, 'Keep each person once.'),
		/** Picks outside the operator's roster scope stay unless this removes them all. */
		removeOutsideScope: z.boolean(),
		expectedRevision: z.number().int().min(0)
	})
	.strict()
	.refine((input) => input.keep.every((id) => input.personnelIds.includes(id)), {
		path: ['keep'],
		message: 'Keep only people who stay picked.'
	});

export type StaffingSave = z.output<typeof staffingSaveSchema>;

export type StaffingSaveOutcome = { outcome: 'saved' | 'unchanged' | 'conflict'; revision: number };

/**
 * `conflict` means someone else saved first; nothing was written and `staffing` is what they saved.
 * `revision` is the one this save wrote or found; `staffing` is read afterwards and may already be newer.
 */
export type StaffingSaveResult = StaffingSaveOutcome & { staffing: TaskingStaffing };

/** The selection a save asks for, kept apart from what is stored so a failed or refused save loses nothing. */
export interface StaffingDraft {
	personnelIds: string[];
	keep: string[];
	removeOutsideScope: boolean;
}

export const draftOf = (staffing: TaskingStaffing): StaffingDraft => ({
	personnelIds: staffing.picks.map((pick) => pick.personnelId),
	keep: [],
	removeOutsideScope: false
});

export type StaffingPersonState =
	| { kind: 'unknown'; reason: 'failed' | 'no_execution' }
	| { kind: 'clear' }
	| { kind: 'conflict'; availability: Extract<StaffingAdvisory, { kind: 'availability' }>[] }
	| { kind: 'committed_elsewhere'; commitments: Exclude<StaffingAdvisory, { kind: 'availability' }>[] };

export function staffingPersonState(personnelId: string, advisories: StaffingAdvisories): StaffingPersonState {
	if (advisories.kind !== 'loaded') return { kind: 'unknown', reason: advisories.kind };
	const rows = advisories.byPerson[personnelId] ?? [];
	const availability = rows.filter(
		(row): row is Extract<StaffingAdvisory, { kind: 'availability' }> => row.kind === 'availability' && row.isConflict
	);
	if (availability.length > 0) return { kind: 'conflict', availability };
	const commitments = rows.filter((row) => row.kind !== 'availability');
	return commitments.length > 0 ? { kind: 'committed_elsewhere', commitments } : { kind: 'clear' };
}
