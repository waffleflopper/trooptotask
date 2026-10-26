import { z } from 'zod';
import type { TaskingResponsibility } from './taskingModel';

/** Most urgent first; a Tasking appears once, under the first kind it meets. */
export const TASKING_ATTENTION_KINDS = ['overdue', 'blocked', 'short', 'due_soon'] as const;
export type TaskingAttentionKind = (typeof TASKING_ATTENTION_KINDS)[number];

export const ATTENTION_ROW_LIMIT = 100;

/** An active Tasking in the viewer's scope that needs attention, with the facts its row names. */
export interface TaskingAttentionRow {
	taskingId: string;
	kind: TaskingAttentionKind;
	title: string;
	responsibility: TaskingResponsibility;
	eventTitle: string | null;
	suspenseOn: string;
	executionStartsOn: string | null;
	/** Null when the Tasking has no staffing requirement. */
	required: number | null;
	/** Picks that fill the requirement; a pick under review never does. */
	picked: number;
	equipmentNotReady: number;
}

export interface TaskingAttentionProjection {
	/** Bounded, most urgent first. */
	rows: TaskingAttentionRow[];
	/** Every Tasking needing attention, including those the row bound left out. */
	total: number;
}

export const attentionRowSchema = z
	.object({
		tasking_id: z.string(),
		kind: z.enum(TASKING_ATTENTION_KINDS),
		title: z.string(),
		responsible_group_id: z.string().nullable(),
		event_title: z.string().nullable(),
		suspense_on: z.string(),
		execution_starts_on: z.string().nullable(),
		staffing_required: z.number().nullable(),
		staffing_picked: z.number(),
		equipment_not_ready: z.number(),
		attention_total: z.coerce.number()
	})
	.transform((row) => ({
		total: row.attention_total,
		row: {
			taskingId: row.tasking_id,
			kind: row.kind,
			title: row.title,
			responsibility: (row.responsible_group_id === null
				? { kind: 'organization' }
				: { kind: 'group', groupId: row.responsible_group_id }) as TaskingResponsibility,
			eventTitle: row.event_title,
			suspenseOn: row.suspense_on,
			executionStartsOn: row.execution_starts_on,
			required: row.staffing_required,
			picked: row.staffing_picked,
			equipmentNotReady: row.equipment_not_ready
		} satisfies TaskingAttentionRow
	}));
