import type { SupabaseClient } from '$lib/server/database';
import { z } from 'zod';
import { fail } from '$lib/errors';
import type {
	ChecklistChange,
	ChecklistItem,
	EquipmentChange,
	EquipmentDraft,
	EquipmentRequirement,
	TaskingListKind,
	TaskingLists
} from './taskingListsModel';
import { TASKING_LIST_LIMIT } from './taskingListsModel';
import { TASKING_GONE } from './taskingPersistence.server';

export const LIST_ITEM_GONE = 'That item is no longer available.';
export const LIST_FULL = `A tasking holds up to ${TASKING_LIST_LIMIT} items in each list.`;
const LIST_DENIED = 'You do not have Calendar operation access for this tasking.';
const LIST_CLOSED = 'A completed or cancelled tasking cannot change. Reopen it first.';

export interface CalendarTaskingListsPersistence {
	list(taskingId: string): Promise<TaskingLists>;
	/** Retrying the same id converges on the item the first attempt added, with `created` false. */
	addEquipment(
		taskingId: string,
		id: string,
		draft: EquipmentDraft
	): Promise<{ item: EquipmentRequirement; created: boolean }>;
	updateEquipment(taskingId: string, id: string, change: EquipmentChange): Promise<EquipmentRequirement | null>;
	removeEquipment(taskingId: string, id: string): Promise<EquipmentRequirement | null>;
	addChecklistItem(taskingId: string, id: string, label: string): Promise<{ item: ChecklistItem; created: boolean }>;
	updateChecklistItem(taskingId: string, id: string, change: ChecklistChange): Promise<ChecklistItem | null>;
	removeChecklistItem(taskingId: string, id: string): Promise<ChecklistItem | null>;
	/** Ids listed come first in that order; items not listed keep their order after them. */
	reorder(taskingId: string, list: TaskingListKind, ids: string[]): Promise<void>;
}

const EQUIPMENT_COLUMNS = 'id, name, quantity, secured_quantity, returned_quantity';
const CHECKLIST_COLUMNS = 'id, label, done, done_at, done_by';
const ORDER = { ascending: true } as const;

const equipmentRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	quantity: z.number(),
	secured_quantity: z.number(),
	returned_quantity: z.number().default(0)
});
const checklistRowSchema = z.object({
	id: z.string(),
	label: z.string(),
	done: z.boolean(),
	done_at: z.string().nullable(),
	done_by: z.string().nullable()
});

function toEquipment(raw: unknown): EquipmentRequirement {
	const row = equipmentRowSchema.parse(raw);
	return {
		id: row.id,
		name: row.name,
		quantity: row.quantity,
		securedQuantity: row.secured_quantity,
		returnedQuantity: row.returned_quantity
	};
}

function toChecklistItem(raw: unknown): ChecklistItem {
	const row = checklistRowSchema.parse(raw);
	return { id: row.id, label: row.label, done: row.done, doneAt: row.done_at, doneBy: row.done_by };
}

function writeFailure(error: { code?: string; message: string }): never {
	switch (error.code) {
		case '42501':
			return fail(403, LIST_DENIED);
		case '55000':
			return fail(409, LIST_CLOSED);
		case 'P0002':
			return fail(404, TASKING_GONE);
		case '54000':
			return fail(409, LIST_FULL);
		case '23503':
			return fail(404, TASKING_GONE);
		case '23514':
		case '22023':
			return fail(400, 'Check the item and try again.');
		default:
			throw new Error(error.message);
	}
}

export function createSupabaseCalendarTaskingListsPersistence(
	client: SupabaseClient,
	orgId: string
): CalendarTaskingListsPersistence {
	const equipment = () => client.from('calendar_tasking_equipment');
	const checklist = () => client.from('calendar_tasking_checklist_items');

	return {
		async list(taskingId) {
			const [equipmentRows, checklistRows] = await Promise.all([
				equipment()
					.select(EQUIPMENT_COLUMNS)
					.eq('organization_id', orgId)
					.eq('tasking_id', taskingId)
					.order('position', ORDER)
					.order('created_at', ORDER)
					.order('id', ORDER),
				checklist()
					.select(CHECKLIST_COLUMNS)
					.eq('organization_id', orgId)
					.eq('tasking_id', taskingId)
					.order('position', ORDER)
					.order('created_at', ORDER)
					.order('id', ORDER)
			]);
			if (equipmentRows.error) throw new Error(equipmentRows.error.message);
			if (checklistRows.error) throw new Error(checklistRows.error.message);
			return {
				equipment: (equipmentRows.data ?? []).map(toEquipment),
				checklist: (checklistRows.data ?? []).map(toChecklistItem)
			};
		},
		async addEquipment(taskingId, id, draft) {
			const { data, error } = await equipment()
				.insert({
					id,
					organization_id: orgId,
					tasking_id: taskingId,
					name: draft.name,
					quantity: draft.quantity,
					secured_quantity: draft.securedQuantity
				})
				.select(EQUIPMENT_COLUMNS)
				.single();
			if (error?.code === '23505' || error?.code === '54000') {
				const existing = await equipment()
					.select(EQUIPMENT_COLUMNS)
					.eq('organization_id', orgId)
					.eq('tasking_id', taskingId)
					.eq('id', id)
					.maybeSingle();
				if (existing.data) return { item: toEquipment(existing.data), created: false };
			}
			if (error) return writeFailure(error);
			return { item: toEquipment(data), created: true };
		},
		async updateEquipment(taskingId, id, change) {
			const { data, error } = await equipment()
				.update({
					...(change.name !== undefined && { name: change.name }),
					...(change.quantity !== undefined && { quantity: change.quantity }),
					...(change.securedQuantity !== undefined && { secured_quantity: change.securedQuantity }),
					...(change.returnedQuantity !== undefined && { returned_quantity: change.returnedQuantity })
				})
				.eq('organization_id', orgId)
				.eq('tasking_id', taskingId)
				.eq('id', id)
				.select(EQUIPMENT_COLUMNS)
				.maybeSingle();
			if (error) return writeFailure(error);
			return data ? toEquipment(data) : null;
		},
		async removeEquipment(taskingId, id) {
			const { data, error } = await equipment()
				.delete()
				.eq('organization_id', orgId)
				.eq('tasking_id', taskingId)
				.eq('id', id)
				.select(EQUIPMENT_COLUMNS)
				.maybeSingle();
			if (error) return writeFailure(error);
			return data ? toEquipment(data) : null;
		},
		async addChecklistItem(taskingId, id, label) {
			const { data, error } = await checklist()
				.insert({ id, organization_id: orgId, tasking_id: taskingId, label })
				.select(CHECKLIST_COLUMNS)
				.single();
			if (error?.code === '23505' || error?.code === '54000') {
				const existing = await checklist()
					.select(CHECKLIST_COLUMNS)
					.eq('organization_id', orgId)
					.eq('tasking_id', taskingId)
					.eq('id', id)
					.maybeSingle();
				if (existing.data) return { item: toChecklistItem(existing.data), created: false };
			}
			if (error) return writeFailure(error);
			return { item: toChecklistItem(data), created: true };
		},
		async updateChecklistItem(taskingId, id, change) {
			const { data, error } = await checklist()
				.update({
					...(change.label !== undefined && { label: change.label }),
					...(change.done !== undefined && { done: change.done })
				})
				.eq('organization_id', orgId)
				.eq('tasking_id', taskingId)
				.eq('id', id)
				.select(CHECKLIST_COLUMNS)
				.maybeSingle();
			if (error) return writeFailure(error);
			return data ? toChecklistItem(data) : null;
		},
		async removeChecklistItem(taskingId, id) {
			const { data, error } = await checklist()
				.delete()
				.eq('organization_id', orgId)
				.eq('tasking_id', taskingId)
				.eq('id', id)
				.select(CHECKLIST_COLUMNS)
				.maybeSingle();
			if (error) return writeFailure(error);
			return data ? toChecklistItem(data) : null;
		},
		async reorder(taskingId, list, ids) {
			const { error } = await client.rpc('reorder_calendar_tasking_list', {
				p_organization_id: orgId,
				p_tasking_id: taskingId,
				p_list: list,
				p_ids: ids
			});
			if (error) writeFailure(error);
		}
	};
}
