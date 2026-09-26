/**
 * Personnel training entity — maps `personnel_trainings`.
 * Training records use Training-lane SQL RLS for Organization and Group reads.
 * `expirationDate` is computed from `completionDate +
 * training_type.expiration_months` by `calculateExpirationDate` in `trainingRecords.ts`.
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
