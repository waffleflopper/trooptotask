/**
 * Daily assignment entity — maps `daily_assignments`.
 * Org-scoped only (`groupScope: 'none'`); assignments span groups.
 * Writes use the `dailyAssignments.ts` use case (`replaceAssignments`) rather than generic
 * CRUD since the standard mutation replaces all assignments for a day atomically.
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
		assigneeId: field(z.string(), { column: 'assignee_id' }),
		dutyRosterTemplateRunId: field(z.string().nullable().optional(), {
			column: 'duty_roster_template_run_id'
		}),
		dutyRosterTemplateRunRowDate: field(z.string().nullable().optional(), {
			column: 'duty_roster_template_run_row_date'
		})
	}
});
