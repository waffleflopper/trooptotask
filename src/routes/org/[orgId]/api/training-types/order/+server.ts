import { setTrainingTypeOrder } from '$features/training/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestTrainingCatalogContext } from '$lib/server/adapters/featureRequestContexts.server';

export const _putConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		await setTrainingTypeOrder(ctx, input);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestTrainingCatalogContext>>;

export const PUT = handle(_putConfig);
