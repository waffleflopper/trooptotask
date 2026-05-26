import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { importTrainingRecords } from '$lib/server/core/useCases/trainingRecordsBatch';

type ImportTrainingRecordsInput = Parameters<typeof importTrainingRecords>[1];

export const _postConfig: RouteConfig<ImportTrainingRecordsInput, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => importTrainingRecords(ctx, input)
};

export const POST = handle(_postConfig);
