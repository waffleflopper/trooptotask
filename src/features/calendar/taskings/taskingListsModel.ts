import { z } from 'zod';
import { uuidSchema } from '$lib/utils/inputSchemas';

export const EQUIPMENT_NAME_MAX = 200;
export const EQUIPMENT_QUANTITY_MAX = 9999;
export const CHECKLIST_LABEL_MAX = 200;
/** Per list; the database refuses the 101st item. */
export const TASKING_LIST_LIMIT = 100;

/** Ready is `securedQuantity === quantity` and partial is anything between; there is no separate flag. */
export interface EquipmentRequirement {
	id: string;
	name: string;
	quantity: number;
	securedQuantity: number;
	returnedQuantity?: number;
}

/** `doneBy` is null only when the acting account no longer exists. */
export interface ChecklistItem {
	id: string;
	label: string;
	done: boolean;
	doneAt: string | null;
	doneBy: string | null;
}

export type TaskingListActivityFact =
	| { kind: 'equipment_added' | 'equipment_removed'; name: string; quantity: number; securedQuantity: number }
	| {
			kind: 'equipment_changed';
			from: { name: string; quantity: number };
			to: { name: string; quantity: number };
	  }
	| { kind: 'equipment_secured' | 'equipment_returned'; name: string; quantity: number; from: number; to: number }
	| { kind: 'checklist_added' | 'checklist_removed' | 'checklist_completed' | 'checklist_reopened'; label: string }
	| { kind: 'checklist_renamed'; from: string; to: string };

/** Both lists in the order the operator arranged them. */
export interface TaskingLists {
	equipment: EquipmentRequirement[];
	checklist: ChecklistItem[];
}

export type TaskingListKind = 'equipment' | 'checklist';

export type EquipmentState = 'ready' | 'partial' | 'none';

export function equipmentState({
	quantity,
	securedQuantity
}: Pick<EquipmentRequirement, 'quantity' | 'securedQuantity'>) {
	return securedQuantity >= quantity ? 'ready' : securedQuantity > 0 ? 'partial' : 'none';
}

/** Requirements that are fully secured out of all requirements, with how many sit between none and all. */
export interface EquipmentReadiness {
	total: number;
	ready: number;
	partial: number;
}

export interface ChecklistProgress {
	total: number;
	done: number;
}

/** Each fact is null while the Tasking has no items of that kind. Neither one changes the Tasking's status. */
export interface TaskingReadiness {
	equipment: EquipmentReadiness | null;
	checklist: ChecklistProgress | null;
}

export function equipmentReadiness(
	items: readonly Pick<EquipmentRequirement, 'quantity' | 'securedQuantity'>[]
): EquipmentReadiness | null {
	if (items.length === 0) return null;
	const states = items.map(equipmentState);
	return {
		total: items.length,
		ready: states.filter((state) => state === 'ready').length,
		partial: states.filter((state) => state === 'partial').length
	};
}

export function checklistProgress(items: readonly Pick<ChecklistItem, 'done'>[]): ChecklistProgress | null {
	return items.length === 0 ? null : { total: items.length, done: items.filter((item) => item.done).length };
}

export const readinessOf = (lists: {
	equipment: readonly Pick<EquipmentRequirement, 'quantity' | 'securedQuantity'>[];
	checklist: readonly Pick<ChecklistItem, 'done'>[];
}): TaskingReadiness => ({
	equipment: equipmentReadiness(lists.equipment),
	checklist: checklistProgress(lists.checklist)
});

const requiredText = (label: string, max: number) =>
	z.string().trim().min(1, `Enter ${label}.`).max(max, `Keep ${label} to ${max} characters.`);

const quantitySchema = z
	.number({ error: 'Enter how many.' })
	.int('Enter a whole number.')
	.min(1, 'Enter at least 1.')
	.max(EQUIPMENT_QUANTITY_MAX, `Keep it to ${EQUIPMENT_QUANTITY_MAX}.`);

export const securedSchema = z
	.number({ error: 'Enter how many are secured.' })
	.int('Enter a whole number.')
	.min(0, 'Enter 0 or more.')
	.max(EQUIPMENT_QUANTITY_MAX, `Keep it to ${EQUIPMENT_QUANTITY_MAX}.`);

const withinQuantity = (value: { quantity?: number; securedQuantity?: number }) =>
	value.quantity === undefined || value.securedQuantity === undefined || value.securedQuantity <= value.quantity;
const withinQuantityIssue = { path: ['securedQuantity'], message: 'Secured cannot be more than the quantity.' };

export const equipmentDraftSchema = z
	.object({
		name: requiredText('the equipment', EQUIPMENT_NAME_MAX),
		quantity: quantitySchema,
		securedQuantity: securedSchema
	})
	.strict()
	.refine(withinQuantity, withinQuantityIssue);

export type EquipmentDraft = z.output<typeof equipmentDraftSchema>;

/** Changes only what is named, so securing one item never rewrites a name another operator just fixed. */
export const equipmentChangeSchema = z
	.object({
		name: requiredText('the equipment', EQUIPMENT_NAME_MAX).optional(),
		quantity: quantitySchema.optional(),
		securedQuantity: securedSchema.optional(),
		returnedQuantity: securedSchema.optional()
	})
	.strict()
	.refine((change) => Object.keys(change).length > 0, { message: 'Nothing to change.' })
	.refine(withinQuantity, withinQuantityIssue);

export type EquipmentChange = z.output<typeof equipmentChangeSchema>;

export const equipmentCreateSchema = z.object({ id: uuidSchema, draft: equipmentDraftSchema }).strict();

export const checklistCreateSchema = z
	.object({ id: uuidSchema, label: requiredText('the item', CHECKLIST_LABEL_MAX) })
	.strict();

export const checklistChangeSchema = z
	.object({ label: requiredText('the item', CHECKLIST_LABEL_MAX).optional(), done: z.boolean().optional() })
	.strict()
	.refine((change) => Object.keys(change).length > 0, { message: 'Nothing to change.' });

export type ChecklistChange = z.output<typeof checklistChangeSchema>;

export const listOrderSchema = z.object({ ids: z.array(uuidSchema).max(TASKING_LIST_LIMIT) }).strict();

/** The ids in their new order after moving one item a step, or null at the edge. */
export function movedIds(ids: readonly string[], id: string, step: -1 | 1): string[] | null {
	const from = ids.indexOf(id);
	const to = from + step;
	if (from < 0 || to < 0 || to >= ids.length) return null;
	const next = [...ids];
	[next[from], next[to]] = [next[to], next[from]];
	return next;
}
