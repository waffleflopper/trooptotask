import { readTrainingTypeUsage } from '$features/training/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestTrainingCatalogContext } from '$lib/server/adapters/featureRequestContexts.server';

export const _getConfig = {
	context: createRequestTrainingCatalogContext,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: (ctx) => readTrainingTypeUsage(ctx),
	formatOutput: privateJson
} satisfies RouteConfig<
	void,
	Awaited<ReturnType<typeof readTrainingTypeUsage>>,
	ReturnType<typeof createRequestTrainingCatalogContext>
>;

export const GET = handle(_getConfig);
