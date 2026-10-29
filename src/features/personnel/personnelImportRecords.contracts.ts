import { z } from 'zod';
import type { Personnel } from './personnel.types';
import { normalizeDodId } from './dodId';

const importFields = {
	dodId: z
		.string()
		.transform((value) => normalizeDodId(value) || undefined)
		.optional(),
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

export const personnelBatchMessageSchema = z.object({
	kind: z.enum(['failed', 'unconfirmed']),
	index: z.number().int(),
	message: z.string()
});

export type PersonnelBatchMessage = z.infer<typeof personnelBatchMessageSchema>;

export interface PersonnelImportRecordsResult {
	created: Personnel[];
	updated: Personnel[];
	errors: PersonnelBatchMessage[];
}
