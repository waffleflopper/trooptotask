import { z } from 'zod';
import { uuidSchema } from '$lib/utils/inputSchemas';
import { TASKING_STAFFING_MAX, type StaffingRequirement, type TaskingResponsibility } from '../taskingModel';

/** A picked Person whose roster scope the reader covers. Picks outside it are only counted. */
export interface TaskingPick {
	personnelId: string;
	rank: string;
	firstName: string;
	lastName: string;
	groupId: string | null;
	archived: boolean;
	selectedAt: string;
	/** When the pick stopped qualifying. Only an explicit keep or removal clears it; restoring the Person does not. */
	reviewSince: string | null;
}

/** Every pick of a Tasking, counted the same way for every reader. */
export interface StaffingCount {
	/** Picks that fill the requirement. A pick under review never does. */
	picked: number;
	needsReview: number;
	/** Picks whose person is outside the reader's roster scope, shown only as a number. */
	outsideScope: number;
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
}

export function isCandidateFor(responsibility: TaskingResponsibility, person: { groupId: string | null }): boolean {
	return responsibility.kind === 'organization' || person.groupId === responsibility.groupId;
}

/** Another fact over the execution dates. An inaccessible Tasking is only "committed elsewhere". */
export type StaffingAdvisory =
	| { kind: 'availability'; label: string; startsOn: string; endsOn: string }
	| { kind: 'tasking'; taskingId: string; title: string; startsOn: string; endsOn: string }
	| { kind: 'committed_elsewhere' };

/** Absent dates and a failed read are both different from "no conflicts". */
export type StaffingAdvisories =
	| { kind: 'no_execution' }
	| { kind: 'failed' }
	| { kind: 'loaded'; byPerson: Record<string, StaffingAdvisory[]> };

export interface StaffingPicker {
	staffing: TaskingStaffing;
	candidates: StaffingCandidate[];
	advisories: StaffingAdvisories;
}

/** People named in an Activity entry: names the reader's roster scope covers, and how many others. */
export interface NamedPeople {
	names: string[];
	others: number;
}

export const personName = (person: Pick<TaskingPick, 'rank' | 'firstName' | 'lastName'>) =>
	[person.rank, `${person.lastName}, ${person.firstName}`].filter(Boolean).join(' ');

/** `picked of required`, or just the picked count when nothing is required. */
export function staffingLabel(count: StaffingCount, requirement: StaffingRequirement | null): string | null {
	if (requirement) return `${count.picked} of ${requirement.count}`;
	return count.picked > 0 ? `${count.picked} picked` : null;
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

/** `conflict` means someone else saved first; nothing was written and `staffing` is what they saved. */
export type StaffingSaveResult = { outcome: 'saved' | 'unchanged' | 'conflict'; staffing: TaskingStaffing };

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
