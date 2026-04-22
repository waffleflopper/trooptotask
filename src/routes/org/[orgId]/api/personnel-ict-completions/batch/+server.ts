import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	importIctCompletionsBatch,
	type IctCompletionBatchImportInput,
	type IctCompletionBatchImportResult
} from '$lib/server/core/useCases/ictCompletionsBatch';

export const _postConfig: RouteConfig<IctCompletionBatchImportInput, IctCompletionBatchImportResult> = {
	permission: 'critical-tasks',
	mutation: true,
	fn: (ctx, input) => importIctCompletionsBatch(ctx, input)
};

export const POST = handle(_postConfig);
