import type { z } from 'zod';
import type { AuditPort } from '$lib/audit/contracts';
import { fail } from '$lib/errors';
import { issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '../calendarPolicy.server';
import { isEditable, type Tasking } from './taskingModel';
import {
	checklistChangeSchema,
	checklistCreateSchema,
	equipmentChangeSchema,
	equipmentCreateSchema,
	listOrderSchema,
	type ChecklistItem,
	type EquipmentRequirement,
	type TaskingListKind,
	type TaskingLists
} from './taskingListsModel';
import { LIST_ITEM_GONE, type CalendarTaskingListsPersistence } from './taskingListsPersistence.server';
import type { CalendarTaskingPorts } from './taskingOperations.server';
import { TASKING_GONE } from './taskingPersistence.server';

export interface CalendarTaskingListsPorts extends CalendarTaskingPorts {
	taskingLists: CalendarTaskingListsPersistence;
	/** Reordering is audited here: it changes only positions, which the database triggers do not record. */
	audit: AuditPort;
}

const TASKING_CLOSED = 'A completed or cancelled tasking cannot change. Reopen it first.';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
	return parsed.data;
}

function itemId(id: string): string {
	if (!uuidSchema.safeParse(id).success) fail(404, LIST_ITEM_GONE);
	return id;
}

const reordered = (list: TaskingListKind, tasking: Tasking) => ({
	action: `calendar_tasking.${list}_reordered`,
	resourceType: 'calendar_tasking',
	resourceId: tasking.id,
	record: tasking.title,
	details: { item: null }
});

/**
 * A Tasking the operator can change: visible, in their scope, and not Completed or Cancelled.
 * Equipment comes back after the work, so a return alone may still be recorded on a Completed Tasking.
 */
async function requireEditable(ctx: CalendarTaskingListsPorts, id: string, returnOnly = false): Promise<Tasking> {
	if (!uuidSchema.safeParse(id).success) fail(404, TASKING_GONE);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const tasking = await ctx.calendarTaskings.findTasking(id);
	if (!tasking) fail(404, TASKING_GONE);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, tasking.responsibility);
	if (!isEditable(tasking) && !(returnOnly && tasking.status.kind === 'completed')) fail(409, TASKING_CLOSED);
	return tasking;
}

/** Nothing for a Tasking the viewer cannot see, so another Group's items stay concealed. */
export async function loadTaskingLists(ctx: CalendarTaskingListsPorts, taskingId: string): Promise<TaskingLists> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	if (!uuidSchema.safeParse(taskingId).success) fail(404, TASKING_GONE);
	return ctx.taskingLists.list(taskingId);
}

export async function addEquipment(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	input: unknown
): Promise<EquipmentRequirement> {
	const { id, draft } = parse(equipmentCreateSchema, input);
	const tasking = await requireEditable(ctx, taskingId);
	const { item } = await ctx.taskingLists.addEquipment(tasking.id, id, draft);
	return item;
}

export async function updateEquipment(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	id: string,
	input: unknown
): Promise<EquipmentRequirement> {
	const change = parse(equipmentChangeSchema, input);
	const returnOnly = Object.keys(change).every((key) => key === 'returnedQuantity');
	const tasking = await requireEditable(ctx, taskingId, returnOnly);
	const item = await ctx.taskingLists.updateEquipment(tasking.id, itemId(id), change);
	if (!item) fail(404, LIST_ITEM_GONE);
	return item;
}

/** Removing an item that is already gone succeeds, so a retried removal converges. */
export async function removeEquipment(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	id: string
): Promise<{ removed: boolean }> {
	const tasking = await requireEditable(ctx, taskingId);
	const item = await ctx.taskingLists.removeEquipment(tasking.id, itemId(id));
	return { removed: item !== null };
}

export async function addChecklistItem(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	input: unknown
): Promise<ChecklistItem> {
	const { id, label } = parse(checklistCreateSchema, input);
	const tasking = await requireEditable(ctx, taskingId);
	const { item } = await ctx.taskingLists.addChecklistItem(tasking.id, id, label);
	return item;
}

export async function updateChecklistItem(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	id: string,
	input: unknown
): Promise<ChecklistItem> {
	const change = parse(checklistChangeSchema, input);
	const tasking = await requireEditable(ctx, taskingId);
	const item = await ctx.taskingLists.updateChecklistItem(tasking.id, itemId(id), change);
	if (!item) fail(404, LIST_ITEM_GONE);
	return item;
}

export async function removeChecklistItem(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	id: string
): Promise<{ removed: boolean }> {
	const tasking = await requireEditable(ctx, taskingId);
	const item = await ctx.taskingLists.removeChecklistItem(tasking.id, itemId(id));
	return { removed: item !== null };
}

export async function reorderTaskingList(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	list: TaskingListKind,
	input: unknown
): Promise<TaskingLists> {
	const { ids } = parse(listOrderSchema, input);
	const tasking = await requireEditable(ctx, taskingId);
	await ctx.taskingLists.reorder(tasking.id, list, ids);
	await ctx.audit.log(reordered(list, tasking));
	return ctx.taskingLists.list(tasking.id);
}
