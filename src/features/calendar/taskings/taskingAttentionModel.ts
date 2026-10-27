import { z } from 'zod';
import type { TaskingResponsibility } from './taskingModel';

export const TASKING_ATTENTION_KINDS = ['overdue', 'blocked', 'short', 'conflict'] as const;
export type TaskingAttentionKind = (typeof TASKING_ATTENTION_KINDS)[number];
export const ATTENTION_ROW_LIMIT = 100;

export const taskingConflictSchema = z.object({
	personnelId: z.string(),
	personLabel: z.string(),
	statusLabel: z.string(),
	startsOn: z.string(),
	endsOn: z.string(),
	overlapDays: z.number(),
	executionDays: z.number()
});
export type TaskingConflict = z.infer<typeof taskingConflictSchema>;

interface TaskingAttentionFacts {
	taskingId: string;
	title: string;
	responsibility: TaskingResponsibility;
	eventTitle: string | null;
	suspenseOn: string;
	/** Only while its execution window drives the row's timing; otherwise null. */
	executionStartsOn: string | null;
	required: number | null;
	picked: number;
	equipmentNotReady: number;
}

export type TaskingAttentionRow = TaskingAttentionFacts &
	({ kind: 'overdue' | 'blocked' | 'short' } | { kind: 'conflict'; conflict: TaskingConflict });

export const taskingOnTrackRowSchema = z.object({
	taskingId: z.string(),
	title: z.string(),
	suspenseOn: z.string(),
	responsibleGroupId: z.string().nullable(),
	picked: z.number(),
	required: z.number().nullable(),
	status: z.enum(['open', 'in_progress', 'blocked'])
});
export type TaskingOnTrackRow = z.infer<typeof taskingOnTrackRowSchema>;

export interface TaskingAttentionProjection {
	rows: TaskingAttentionRow[];
	total: number;
	onTrack: TaskingOnTrackRow[];
}

const rowFacts = z.object({
	tasking_id: z.string(),
	title: z.string(),
	responsible_group_id: z.string().nullable(),
	event_title: z.string().nullable(),
	suspense_on: z.string(),
	execution_starts_on: z.string().nullable(),
	staffing_required: z.number().nullable(),
	staffing_picked: z.number(),
	equipment_not_ready: z.number()
});
export const attentionRowSchema = rowFacts
	.and(
		z.discriminatedUnion('kind', [
			z.object({ kind: z.enum(['overdue', 'blocked', 'short']) }),
			z.object({ kind: z.literal('conflict'), conflict: taskingConflictSchema })
		])
	)
	.transform((row): TaskingAttentionRow => {
		const facts: TaskingAttentionFacts = {
			taskingId: row.tasking_id,
			title: row.title,
			responsibility:
				row.responsible_group_id === null
					? { kind: 'organization' }
					: { kind: 'group', groupId: row.responsible_group_id },
			eventTitle: row.event_title,
			suspenseOn: row.suspense_on,
			executionStartsOn: row.execution_starts_on,
			required: row.staffing_required,
			picked: row.staffing_picked,
			equipmentNotReady: row.equipment_not_ready
		};
		return row.kind === 'conflict'
			? { ...facts, kind: 'conflict', conflict: row.conflict }
			: { ...facts, kind: row.kind };
	});

export const taskingDashboardSchema = z.object({
	rows: z.array(attentionRowSchema),
	total: z.number(),
	onTrack: z.array(taskingOnTrackRowSchema)
});
