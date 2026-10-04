import type { PersonnelImportInput, PersonnelImportResult } from '$features/personnel/contracts';
import { importPersonnelBatch } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDataContext } from '$lib/server/adapters/requestContexts.server';
import { z } from 'zod';

const requiredPersonnelCell = z.preprocess((value) => (value === undefined ? '' : value), z.string());

const batchInput = z.object({
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

export const _postConfig = {
	context: createRequestDataContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
	policyResource: { kind: 'unscoped' },
	input: batchInput,
	fn: (ctx, input) =>
		importPersonnelBatch(ctx, {
			records: input.records
		})
} satisfies RouteConfig<PersonnelImportInput, PersonnelImportResult, ReturnType<typeof createRequestDataContext>>;

export const POST = handle(_postConfig);
