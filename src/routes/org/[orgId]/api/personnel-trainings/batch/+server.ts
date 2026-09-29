import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { importTrainingRecords } from '$features/training/index.server';

import type { TrainingBatchImportInput } from '$features/training/contracts';

export const _postConfig: RouteConfig<TrainingBatchImportInput, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => importTrainingRecords(ctx, input)
};

export const POST = handle(_postConfig);
