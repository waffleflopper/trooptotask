import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';
import { ICT_VALIDATION_METHODS } from '../criticalTasks.types';
import type { PersonnelIctCompletion, PersonnelIctCompletionCreate, PersonnelIctCompletionPatch } from '../contracts';

export interface SavedPersonnelIctCompletion extends Record<string, unknown> {
	id: string;
	personnel_id: string;
	ict_task_id: string;
	completed_at: string;
	validation_method: PersonnelIctCompletion['validationMethod'];
	validated_by: string | null;
	notes: string | null;
	logged_by: string | null;
	created_at: string;
}

export const COMPLETION_SELECT =
	'id,personnel_id,ict_task_id,completed_at,validation_method,validated_by,notes,logged_by,created_at';

export const completionCreateSchema = z.object({
	personnelId: uuidSchema,
	ictTaskId: uuidSchema,
	completedAt: dateOnlySchema,
	validationMethod: z.enum(ICT_VALIDATION_METHODS),
	validatedBy: z.string().nullable().optional(),
	notes: z.string().nullable().optional()
});

export const completionUpdateSchema = completionCreateSchema.partial().extend({ id: uuidSchema });

export function mapPersonnelIctCompletion(row: SavedPersonnelIctCompletion): PersonnelIctCompletion {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		ictTaskId: row.ict_task_id,
		completedAt: row.completed_at,
		validationMethod: row.validation_method,
		validatedBy: row.validated_by,
		notes: row.notes,
		loggedBy: row.logged_by,
		createdAt: row.created_at
	};
}

export function completionPatchValues(input: PersonnelIctCompletionPatch): Record<string, unknown> {
	const values = {
		personnel_id: input.personnelId,
		ict_task_id: input.ictTaskId,
		completed_at: input.completedAt,
		validation_method: input.validationMethod,
		validated_by: input.validatedBy,
		notes: input.notes
	};
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

export function completionCreateValues(input: PersonnelIctCompletionCreate): Record<string, unknown> {
	return {
		personnel_id: input.personnelId,
		ict_task_id: input.ictTaskId,
		completed_at: input.completedAt,
		validation_method: input.validationMethod,
		validated_by: input.validatedBy ?? null,
		notes: input.notes ?? null
	};
}
