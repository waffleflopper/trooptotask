import { createRequestIctCompletionContext } from '$lib/server/adapters/featureRequestContexts.server';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { importIctCompletionsBatch } from '$features/critical-tasks/index.server';
import type { IctCompletionBatchImportInput, IctCompletionBatchImportResult } from '$features/critical-tasks/contracts';

export const _postConfig: RouteConfig<
	IctCompletionBatchImportInput,
	IctCompletionBatchImportResult,
	ReturnType<typeof createRequestIctCompletionContext>
> = {
	context: createRequestIctCompletionContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => importIctCompletionsBatch(ctx, input)
};

export const POST = handle(_postConfig);
