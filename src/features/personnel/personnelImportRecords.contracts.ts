import { z } from 'zod';
import type { Personnel } from './personnel.types';
import type { PersonnelBatchMessage } from './personnelImport.types';

const importFields = {
	rank: z.string(),
	mos: z.string().optional(),
	clinicRole: z.string().optional(),
	groupId: z.string().nullable().optional(),
	ets: z.string().nullable().optional(),
	deros: z.string().nullable().optional()
};

export const personnelImportRecordsInputSchema = z.object({
	records: z
		.array(
			z.discriminatedUnion('op', [
				z.object({
					op: z.literal('create'),
					...importFields,
					lastName: z.string(),
					firstName: z.string()
				}),
				z.object({
					op: z.literal('update'),
					personnelId: z.string().min(1),
					changes: z.object({ ...importFields, rank: importFields.rank.optional() })
				})
			])
		)
		.min(1)
		.max(500)
});

export type PersonnelImportRecordsInput = z.infer<typeof personnelImportRecordsInputSchema>;
export type PersonnelImportRecordsRecord = PersonnelImportRecordsInput['records'][number];
export type PersonnelImportRecordsChanges = Extract<PersonnelImportRecordsRecord, { op: 'update' }>['changes'];

export interface PersonnelImportRecordsResult {
	created: Personnel[];
	updated: Personnel[];
	errors: PersonnelBatchMessage[];
}
