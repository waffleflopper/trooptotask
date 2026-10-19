import { createRequestTrainingCompletionContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { correctTrainingCompletion } from '$features/training/index.server';
import type { CorrectedTrainingCompletion } from '$features/training/contracts';

export const _patchConfig = {
	context: createRequestTrainingCompletionContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => ({ entry: await correctTrainingCompletion(ctx, input) })
} satisfies RouteConfig<
	Record<string, unknown>,
	{ entry: CorrectedTrainingCompletion },
	Parameters<typeof correctTrainingCompletion>[0]
>;

export const PATCH = handle(_patchConfig);
