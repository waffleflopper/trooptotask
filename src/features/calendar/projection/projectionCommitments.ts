import { toDayNumber } from '$lib/utils/dayNumber';
import type { MarkerListItem } from '$features/calendar/components/projection/MarkerListPopover.svelte';
import type { ProjectedCommitment } from './calendarProjection';
import { indexSpan, type IndexedSpan } from './projectionLayout';
import { eventDatesLabel, type ProjectionLinks } from './projectionLanes';

/** A Person's committed stretch of one row: one Tasking, or several where picks overlap. */
export type CommitmentSegment =
	| {
			readonly conflicts: boolean;
			readonly kind: 'tasking';
			readonly start: number;
			readonly end: number;
			readonly continuesBefore: boolean;
			readonly continuesAfter: boolean;
			readonly label: string;
			readonly href: string;
	  }
	| {
			readonly conflicts: boolean;
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
		const spans = own.map((commitment) => indexSpan(commitment, first));
		const segments: CommitmentSegment[] = [];
		let open: { start: number; key: string; spans: typeof spans } | null = null;
		for (let day = 0; day <= days; day++) {
			const covering = day < days ? spans.filter((span) => span.start <= day && day <= span.end) : [];
			const key = covering.map((span) => span.item.taskingId).join(',');
			if (open && open.key !== key) {
				segments.push(segmentOf(open.spans, open.start, day - 1, links));
				open = null;
			}
			if (covering.length > 0 && !open) open = { start: day, key, spans: covering };
		}
		result.set(personnelId, segments);
	}
	return result;
}

/** The Taskings covering days `start` to `end` of a row, which all cover every one of them. */
function segmentOf(
	covering: readonly IndexedSpan<ProjectedCommitment>[],
	start: number,
	end: number,
	links: ProjectionLinks
): CommitmentSegment {
	const edges = {
		conflicts: covering.some((span) => span.item.conflicts),
		start,
		end,
		continuesBefore: covering.some((span) => span.start < start),
		continuesAfter: covering.some((span) => span.end > end)
	};
	const [only] = covering;
	if (covering.length === 1) {
		return {
			kind: 'tasking',
			...edges,
			label: `Tasking: ${only.item.title}, ${eventDatesLabel(only.item)}`,
			href: links.tasking(only.item.taskingId)
		};
	}
	return {
		kind: 'taskings',
		...edges,
		label: `${covering.length} Taskings: ${covering.map((span) => span.item.title).join(', ')}`,
		heading: 'Tasking commitments',
		items: covering.map(({ item }) => ({
			key: item.taskingId,
			title: item.title,
			detail: `Executes ${eventDatesLabel(item)}`,
			href: links.tasking(item.taskingId)
		}))
	};
}
