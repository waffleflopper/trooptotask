import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { dateOnlySchema, issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPersonnelPolicy,
	type CalendarAvailabilityPorts
} from './calendarPolicy.server';
import { AVAILABILITY_BATCH_LIMIT, type SavedAvailabilityEntry } from './contracts';

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

const restoreClaim = z.object({ id: uuidSchema, personnelId: uuidSchema }).strict();

const undoInput = z
	.object({ remove: z.array(undoEntry).optional(), restore: z.array(restoreClaim).optional() })
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
	/** The rows the server put back, with the values it deleted. */
	restored: SavedAvailabilityEntry[];
	/** Entries that were edited, removed or re-added since, or whose Person is gone; left exactly as they are. */
	changedIds: string[];
}

const noteOf = (entry: { note?: string | null }) => entry.note ?? null;

/**
 * Reverses a status change by the rows it wrote. `remove` deletes entries an add created, only while each is still
 * as it was saved. `restore` names entries a removal deleted; the database puts back its own record of what it
 * deleted, for this actor and a short window, unless the id exists again or the Person now has the same status over
 * those dates. Anything else is reported and left alone.
 */
export async function undoAvailabilityChange(
	ctx: CalendarAvailabilityPorts,
	input: Record<string, unknown>
): Promise<AvailabilityUndoResult> {
	const parsed = undoInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const remove = (parsed.data.remove ?? []).map((entry) => ({ ...entry, note: noteOf(entry) }));
	const restore = parsed.data.restore ?? [];

	const personnelIds = [...new Set([...remove, ...restore].map((entry) => entry.personnelId))];
	const people = await requireCalendarPersonnelPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, personnelIds);

	const removable = remove.filter((entry) => people.has(entry.personnelId));
	const restorable = restore.filter((entry) => people.has(entry.personnelId));

	const [removedIds, restored] = await Promise.all([
		removable.length ? ctx.calendarAvailability.deleteUnchanged(removable) : [],
		restorable.length ? ctx.calendarAvailability.restoreRemoved(restorable) : []
	]);

	const done = new Set([...removedIds, ...restored.map((entry) => entry.id)]);
	return {
		removedIds,
		restored,
		changedIds: [...remove, ...restore].map((entry) => entry.id).filter((id) => !done.has(id))
	};
}
