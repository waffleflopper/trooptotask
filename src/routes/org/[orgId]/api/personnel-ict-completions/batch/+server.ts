import { createRequestIctCompletionContext } from '$lib/server/adapters/featureRequestContexts.server';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { importIctCompletionsBatch } from '$features/critical-tasks/index.server';
import type { IctCompletionBatchImportInput, IctCompletionBatchImportResult } from '$features/critical-tasks/contracts';
import { z } from 'zod';

const importCell = z
	.string({ error: 'Import cells must be text' })
	.nullable()
	.transform((value) => value ?? '');

const batchInput = z.object({
	records: z.array(
		z.object(
			{
				rowNumber: z.number({ error: 'Row number must be a whole number' }).int('Row number must be a whole number'),
				values: z.record(z.string(), importCell, { error: 'Each import row needs its cell values' })
			},
			{ error: 'Each import row needs a row number and cell values' }
		),
		{ error: 'records array is required' }
	)
});

export const _postConfig = {
	context: createRequestIctCompletionContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
	policyResource: { kind: 'unscoped' },
	input: batchInput,
	fn: (ctx, input) => importIctCompletionsBatch(ctx, input)
} satisfies RouteConfig<
	IctCompletionBatchImportInput,
	IctCompletionBatchImportResult,
	ReturnType<typeof createRequestIctCompletionContext>
>;

export const POST = handle(_postConfig);
