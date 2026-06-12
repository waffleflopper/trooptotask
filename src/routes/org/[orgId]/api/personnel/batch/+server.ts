import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { importPersonnelBatch } from '$lib/server/core/useCases/personnelBatch';
import { z } from 'zod';

const batchInput = z.object({
	records: z.array(
		z.object({
			rank: z.string(),
			lastName: z.string(),
			firstName: z.string(),
			mos: z.string().nullable().optional(),
			clinicRole: z.string().nullable().optional(),
			groupName: z.string().nullable().optional(),
			ets: z.string().nullable().optional(),
			deros: z.string().nullable().optional()
		})
	)
});

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
	policyResource: { kind: 'unscoped' },
	input: batchInput,
	fn: (ctx, input) =>
		importPersonnelBatch(ctx, {
			records: input.records
		})
} satisfies RouteConfig<z.infer<typeof batchInput>, unknown>;

export const POST = handle(_postConfig);
