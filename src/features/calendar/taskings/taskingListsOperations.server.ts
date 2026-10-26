import type { z } from 'zod';
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

const audited = (verb: string, tasking: Tasking, item?: string) => ({
	action: `calendar_tasking.${verb}`,
	resourceType: 'calendar_tasking',
	resourceId: tasking.id,
	details: { title: tasking.title, ...(item && { item }) }
});

/** A Tasking the operator can change: visible, in their scope, and not Completed or Cancelled. */
async function requireEditable(ctx: CalendarTaskingListsPorts, id: string): Promise<Tasking> {
	if (!uuidSchema.safeParse(id).success) fail(404, TASKING_GONE);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const tasking = await ctx.calendarTaskings.findTasking(id);
	if (!tasking) fail(404, TASKING_GONE);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, tasking.responsibility);
	if (!isEditable(tasking)) fail(409, TASKING_CLOSED);
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
	const { item, created } = await ctx.taskingLists.addEquipment(tasking.id, id, draft);
	if (created) await ctx.audit.log(audited('equipment_added', tasking, item.name));
	return item;
}

export async function updateEquipment(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	id: string,
	input: unknown
): Promise<EquipmentRequirement> {
	const change = parse(equipmentChangeSchema, input);
	const tasking = await requireEditable(ctx, taskingId);
	const item = await ctx.taskingLists.updateEquipment(tasking.id, itemId(id), change);
	if (!item) fail(404, LIST_ITEM_GONE);
	if (change.name !== undefined || change.quantity !== undefined)
		await ctx.audit.log(audited('equipment_changed', tasking, item.name));
	if (change.securedQuantity !== undefined) await ctx.audit.log(audited('equipment_secured', tasking, item.name));
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
	if (item) await ctx.audit.log(audited('equipment_removed', tasking, item.name));
	return { removed: item !== null };
}

export async function addChecklistItem(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	input: unknown
): Promise<ChecklistItem> {
	const { id, label } = parse(checklistCreateSchema, input);
	const tasking = await requireEditable(ctx, taskingId);
	const { item, created } = await ctx.taskingLists.addChecklistItem(tasking.id, id, label);
	if (created) await ctx.audit.log(audited('checklist_added', tasking, item.label));
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
	if (change.label !== undefined) await ctx.audit.log(audited('checklist_renamed', tasking, item.label));
	if (change.done !== undefined)
		await ctx.audit.log(audited(item.done ? 'checklist_completed' : 'checklist_reopened', tasking, item.label));
	return item;
}

export async function removeChecklistItem(
	ctx: CalendarTaskingListsPorts,
	taskingId: string,
	id: string
): Promise<{ removed: boolean }> {
	const tasking = await requireEditable(ctx, taskingId);
	const item = await ctx.taskingLists.removeChecklistItem(tasking.id, itemId(id));
	if (item) await ctx.audit.log(audited('checklist_removed', tasking, item.label));
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
	await ctx.audit.log(audited(`${list}_reordered`, tasking));
	return ctx.taskingLists.list(tasking.id);
}
