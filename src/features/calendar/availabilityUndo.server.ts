import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { dateOnlySchema, issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { rangesOverlap } from './utils/availabilityMutation';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPersonnelPolicy,
	type CalendarAvailabilityPorts
} from './calendarPolicy.server';
import { AVAILABILITY_BATCH_LIMIT, type AvailabilityEntry } from './contracts';

const undoEntry = z
	.object({
		id: uuidSchema,
		personnelId: uuidSchema,
		statusTypeId: uuidSchema,
		startDate: dateOnlySchema,
		endDate: dateOnlySchema,
		note: z.string().max(200, 'Note must be 200 characters or fewer').nullable().optional()
	})
	.strict()
	.refine((entry) => entry.startDate <= entry.endDate, 'End date must be on or after the start date');

const undoInput = z
	.object({ remove: z.array(undoEntry).optional(), restore: z.array(undoEntry).optional() })
	.strict()
	.superRefine((input, context) => {
		const ids = [...(input.remove ?? []), ...(input.restore ?? [])].map((entry) => entry.id);
		if (ids.length === 0) context.addIssue({ code: 'custom', message: 'Nothing to undo' });
		else if (ids.length > AVAILABILITY_BATCH_LIMIT)
			context.addIssue({ code: 'custom', message: `Undo at most ${AVAILABILITY_BATCH_LIMIT} statuses at a time` });
		else if (new Set(ids).size !== ids.length)
			context.addIssue({ code: 'custom', message: 'Each status appears once' });
	});

export interface AvailabilityUndoResult {
	removedIds: string[];
	restoredIds: string[];
	/** Entries that were edited, removed or re-added since, or whose Person is gone; left exactly as they are. */
	changedIds: string[];
}

const noteOf = (entry: Pick<AvailabilityEntry, 'note'>) => entry.note ?? null;

/**
 * Reverses a status change by the rows it wrote. `remove` deletes entries an add created, only while each is still
 * as it was saved. `restore` brings back entries a removal deleted under their own ids, unless the id exists again
 * or the Person now has the same status over those dates. Anything else is reported and left alone.
 */
export async function undoAvailabilityChange(
	ctx: CalendarAvailabilityPorts,
	input: Record<string, unknown>
): Promise<AvailabilityUndoResult> {
	const parsed = undoInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const remove = parsed.data.remove ?? [];
	const restore = (parsed.data.restore ?? []).map((entry) => ({ ...entry, note: noteOf(entry) }));

	const personnelIds = [...new Set([...remove, ...restore].map((entry) => entry.personnelId))];
	const people = await requireCalendarPersonnelPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, personnelIds);

	const restorable = restore.filter((entry) => people.has(entry.personnelId));
	const overlapping = restorable.length
		? await ctx.calendarAvailability.listOverlapping({
				rangeStart: restorable.reduce(
					(first, entry) => (entry.startDate < first ? entry.startDate : first),
					restorable[0].startDate
				),
				rangeEnd: restorable.reduce(
					(last, entry) => (entry.endDate > last ? entry.endDate : last),
					restorable[0].endDate
				),
				personnelIds: [...new Set(restorable.map((entry) => entry.personnelId))]
			})
		: [];
	const restorableNow = restorable.filter(
		(entry) =>
			!overlapping.some(
				(other) =>
					other.id !== entry.id &&
					other.personnelId === entry.personnelId &&
					rangesOverlap(other.startDate, other.endDate, entry.startDate, entry.endDate) &&
					other.statusTypeId === entry.statusTypeId
			)
	);
	const removable = remove.filter((entry) => people.has(entry.personnelId));

	const [removedIds, restoredIds] = await Promise.all([
		removable.length ? ctx.calendarAvailability.deleteUnchanged(removable) : [],
		restorableNow.length ? ctx.calendarAvailability.restoreMany(restorableNow) : []
	]);

	const done = new Set([...removedIds, ...restoredIds]);
	return {
		removedIds,
		restoredIds,
		changedIds: [...remove, ...restore].map((entry) => entry.id).filter((id) => !done.has(id))
	};
}
