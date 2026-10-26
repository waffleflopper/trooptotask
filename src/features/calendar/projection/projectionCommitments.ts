import { toDayNumber } from '$lib/utils/dayNumber';
import type { MarkerListItem } from '$features/calendar/components/projection/MarkerListPopover.svelte';
import type { ProjectedCommitment } from './calendarProjection';
import { hiddenBehind, indexSpan, layoutSingleRow } from './projectionLayout';
import { eventDatesLabel, type ProjectionLinks } from './projectionLanes';

/** A Person's committed stretch of one row: one Tasking, or several where picks overlap. */
export type CommitmentSegment =
	| {
			readonly kind: 'tasking';
			readonly start: number;
			readonly end: number;
			readonly continuesBefore: boolean;
			readonly continuesAfter: boolean;
			readonly label: string;
			readonly href: string;
	  }
	| {
			readonly kind: 'taskings';
			readonly start: number;
			readonly end: number;
			readonly continuesBefore: boolean;
			readonly continuesAfter: boolean;
			readonly label: string;
			readonly heading: string;
			readonly items: readonly MarkerListItem[];
	  };

export type CommitmentsByPerson = ReadonlyMap<string, readonly CommitmentSegment[]>;

const NONE: readonly CommitmentSegment[] = [];

export function commitmentsOf(by: CommitmentsByPerson | undefined, personnelId: string): readonly CommitmentSegment[] {
	return by?.get(personnelId) ?? NONE;
}

/**
 * Each Person's commitments as segments over the visible days. Taskings that overlap share one segment that opens
 * a list, so a row never stacks more than the one reserved slot.
 */
export function commitmentsByPerson(
	commitments: readonly ProjectedCommitment[],
	firstVisibleDateKey: string,
	days: number,
	links: ProjectionLinks
): CommitmentsByPerson {
	const first = toDayNumber(firstVisibleDateKey);
	const grouped = new Map<string, ProjectedCommitment[]>();
	for (const commitment of commitments) {
		const list = grouped.get(commitment.personnelId);
		if (list) list.push(commitment);
		else grouped.set(commitment.personnelId, [commitment]);
	}

	const result = new Map<string, readonly CommitmentSegment[]>();
	for (const [personnelId, own] of grouped) {
		const { runs, overflows } = layoutSingleRow(
			own.map((commitment) => indexSpan(commitment, first)),
			days,
			(commitment) => commitment.taskingId
		);
		const segments = runs.map((run): CommitmentSegment => {
			const all = [run.item, ...hiddenBehind(run, overflows, (commitment) => commitment.taskingId)];
			const edges = {
				start: run.start,
				end: run.end,
				continuesBefore: run.continuesBefore,
				continuesAfter: run.continuesAfter
			};
			if (all.length === 1) {
				return {
					kind: 'tasking',
					...edges,
					label: `Tasking: ${run.item.title}, ${eventDatesLabel(run.item)}`,
					href: links.tasking(run.item.taskingId)
				};
			}
			return {
				kind: 'taskings',
				...edges,
				label: `${all.length} Taskings: ${all.map((commitment) => commitment.title).join(', ')}`,
				heading: 'Tasking commitments',
				items: all.map((commitment) => ({
					key: commitment.taskingId,
					title: commitment.title,
					detail: `Executes ${eventDatesLabel(commitment)}`,
					href: links.tasking(commitment.taskingId)
				}))
			};
		});
		result.set(personnelId, segments);
	}
	return result;
}
