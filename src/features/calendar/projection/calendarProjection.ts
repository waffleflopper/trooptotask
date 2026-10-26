import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';

const activeStatusSchema = z.enum(['open', 'in_progress', 'blocked']);

const projectedEventSchema = z.object({
	id: uuidSchema,
	title: z.string(),
	startsOn: dateOnlySchema,
	endsOn: dateOnlySchema,
	cancelled: z.boolean(),
	/** A Tasking on the Event that is not cancelled is in the reader's scope. The Calendar does not use it. */
	hasWork: z.boolean()
});

const projectedSuspenseSchema = z.object({
	taskingId: uuidSchema,
	title: z.string(),
	suspenseOn: dateOnlySchema,
	status: activeStatusSchema
});

const projectedCommitmentSchema = z.object({
	taskingId: uuidSchema,
	title: z.string(),
	personnelId: uuidSchema,
	startsOn: dateOnlySchema,
	endsOn: dateOnlySchema
});

/** What `calendar_range_projection` returns; the database has already applied the reader's read policy. */
export const calendarProjectionSchema = z.object({
	events: z.array(projectedEventSchema),
	suspenses: z.array(projectedSuspenseSchema),
	commitments: z.array(projectedCommitmentSchema)
});

/** An Event that overlaps the range. A cancelled Event stays so the Calendar can say so. */
export type ProjectedEvent = z.infer<typeof projectedEventSchema>;

/** An open, in progress or blocked Tasking the reader can see, due inside the range. */
export type ProjectedSuspense = z.infer<typeof projectedSuspenseSchema>;

/**
 * A picked Person committed to an active Tasking over its execution dates, which may run past the range.
 * Only People in the reader's Calendar roster scope, on Taskings the reader can see, whose pick counts.
 */
export type ProjectedCommitment = z.infer<typeof projectedCommitmentSchema>;

export type CalendarProjection = z.infer<typeof calendarProjectionSchema>;

/** The projection of one range read: the facts, or the one region that could not load. */
export type CalendarProjectionRead = ({ kind: 'loaded' } & CalendarProjection) | { kind: 'failed' };

export const EMPTY_PROJECTION: CalendarProjection = { events: [], suspenses: [], commitments: [] };

/** Reads of adjacent ranges both return an Event or commitment that spans their edge, so each identity is kept once. */
export function mergeProjections(current: CalendarProjection, next: CalendarProjection): CalendarProjection {
	return {
		events: uniqueBy([...current.events, ...next.events], (event) => event.id).sort(
			(a, b) => a.startsOn.localeCompare(b.startsOn) || a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1)
		),
		suspenses: uniqueBy([...current.suspenses, ...next.suspenses], (suspense) => suspense.taskingId),
		commitments: uniqueBy(
			[...current.commitments, ...next.commitments],
			(commitment) => `${commitment.personnelId}:${commitment.taskingId}`
		)
	};
}

/** A fresh read of `range` replaces what an earlier read held there, so a completed Tasking's rail does not linger. */
export function replaceProjectionRange(
	current: CalendarProjection,
	range: { rangeStart: string; rangeEnd: string },
	next: CalendarProjection
): CalendarProjection {
	const overlaps = ({ startsOn, endsOn }: { startsOn: string; endsOn: string }) =>
		endsOn >= range.rangeStart && startsOn <= range.rangeEnd;
	return mergeProjections(
		{
			events: current.events.filter((event) => !overlaps(event)),
			suspenses: current.suspenses.filter(
				({ suspenseOn }) => suspenseOn < range.rangeStart || suspenseOn > range.rangeEnd
			),
			commitments: current.commitments.filter((commitment) => !overlaps(commitment))
		},
		next
	);
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
	return [...new Map(items.map((item) => [key(item), item])).values()];
}
