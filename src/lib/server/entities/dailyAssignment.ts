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
	}
});
