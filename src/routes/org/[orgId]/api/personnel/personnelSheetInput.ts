import { z } from 'zod';

const requiredPersonnelCell = z.preprocess((value) => (value === undefined ? '' : value), z.string());

/** Spreadsheet rows shared by the import and merge routes. */
export const personnelSheetInput = z.object({
	records: z.array(
		z.object({
			rank: requiredPersonnelCell,
			lastName: requiredPersonnelCell,
			firstName: requiredPersonnelCell,
			mos: z.string().nullable().optional(),
			clinicRole: z.string().nullable().optional(),
			groupName: z.string().nullable().optional(),
			ets: z.string().nullable().optional(),
			deros: z.string().nullable().optional()
		})
	)
});
