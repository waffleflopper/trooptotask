/**
 * Personnel training entity — maps `personnel_trainings`.
 * Org-scoped only; training records are not filtered by group on reads so the training
 * matrix can show the full org. `expirationDate` is computed from `completionDate +
 * training_type.validity_months` by `calculateExpirationDate` in `trainingRecords.ts`.
 */
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { PersonnelTraining } from '$features/training/training.types';

export const PersonnelTrainingEntity = defineEntity<PersonnelTraining>({
	table: 'personnel_trainings',
	groupScope: 'none',
	schema: {
		id: field(z.string(), { readOnly: true }),
		personnelId: field(z.string(), { column: 'personnel_id' }),
		trainingTypeId: field(z.string(), { column: 'training_type_id' }),
		completionDate: field(z.string().nullable(), { column: 'completion_date', insertDefault: null }),
		expirationDate: field(z.string().nullable(), { column: 'expiration_date', insertDefault: null }),
		notes: field(z.string().nullable().optional(), { insertDefault: null }),
		certificateUrl: field(z.string().nullable().optional(), { column: 'certificate_url', insertDefault: null })
	}
});
