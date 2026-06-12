import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { importIctTasksBatch } from '$lib/server/core/useCases/ictTasksBatch';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { z } from 'zod';

const batchInput = z.object({
	mode: z.enum(['create-only', 'upsert']),
	records: z.array(z.object({ rowNumber: z.number(), values: z.record(z.string(), z.string()) })).default([])
});

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
	input: batchInput,
	fn: (ctx, input) =>
		importIctTasksBatch(ctx, {
			mode: input.mode,
			records: input.records
		})
} satisfies RouteConfig<z.infer<typeof batchInput>, unknown>;

export const POST = handle(_postConfig);
