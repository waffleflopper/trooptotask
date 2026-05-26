import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	importIctCompletionsBatch,
	type IctCompletionBatchImportInput,
	type IctCompletionBatchImportResult
} from '$lib/server/core/useCases/ictCompletionsBatch';

export const _postConfig: RouteConfig<IctCompletionBatchImportInput, IctCompletionBatchImportResult> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => importIctCompletionsBatch(ctx, input)
};

export const POST = handle(_postConfig);
