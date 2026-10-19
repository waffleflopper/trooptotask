import type { RequestEvent } from '@sveltejs/kit';
import { createRequestTrainingCatalogContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { setTrainingExemption } from '$features/training/index.server';

export const _putConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => ({
		typeId: event.params.typeId,
		personnelId: event.params.personnelId,
		exempt: (await readJsonBody(event)).exempt
	}),
	fn: (ctx, input) => setTrainingExemption(ctx, input)
} satisfies RouteConfig<
	Record<string, unknown>,
	{ exempt: boolean },
	ReturnType<typeof createRequestTrainingCatalogContext>
>;

export const PUT = handle(_putConfig);
