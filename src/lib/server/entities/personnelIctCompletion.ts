import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import { ICT_VALIDATION_METHODS, type PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const PersonnelIctCompletionEntity = defineEntity<PersonnelIctCompletion>({
	table: 'personnel_ict_completions',
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
	groupScope: { personnelColumn: 'personnel_id' },
	audit: { resourceType: 'personnel_ict_completion', detailFields: ['personnelId', 'ictTaskId', 'completedAt'] },
	orderBy: [{ column: 'completed_at', ascending: false }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true }),
		ictTaskId: field(z.string(), { column: 'ict_task_id' }),
		completedAt: field(z.string(), { column: 'completed_at' }),
		validationMethod: field(z.enum(ICT_VALIDATION_METHODS), { column: 'validation_method' }),
		validatedBy: field(z.string().nullable().optional(), {
			column: 'validated_by',
			insertDefault: null
		}),
		notes: field(z.string().nullable().optional(), { insertDefault: null }),
		loggedBy: field(z.string().nullable(), {
			column: 'logged_by',
			readOnly: true
		}),
		createdAt: field(z.string(), {
			column: 'created_at',
			readOnly: true
		})
	}
});
