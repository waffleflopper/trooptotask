/**
 * Daily assignment entity — maps `daily_assignments`.
 * Org-scoped only (`groupScope: 'none'`); assignments span groups.
 * Calendar slot use cases enforce assignee scope and preserve failed-replacement recovery.
 * The response exposes Calendar facts and retained metadata only.
 */
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { DailyAssignment } from '$lib/types';

export const DailyAssignmentEntity = defineEntity<DailyAssignment>({
	table: 'daily_assignments',
	groupScope: 'none',
	schema: {
		id: field(z.string(), { readOnly: true }),
		date: field(z.string()),
		assignmentTypeId: field(z.string(), { column: 'assignment_type_id' }),
		assigneeId: field(z.string(), { column: 'assignee_id' })
	},
	customTransform: (row) => ({
		id: row.id as string,
		date: row.date as string,
		assignmentTypeId: row.assignment_type_id as string,
		assigneeId: row.assignee_id as string,
		...(row.organization_id !== undefined ? { organization_id: row.organization_id } : {}),
		...(row.created_at !== undefined ? { created_at: row.created_at } : {})
	})
});
