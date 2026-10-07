import { createRequestTrainingCatalogContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import { validateUUID } from '$lib/server/validation';
import { createTrainingView, updateTrainingView, deleteTrainingView } from '$features/training/index.server';
import type { TrainingView } from '$features/training/contracts';

export const _postConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createTrainingView(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, TrainingView, ReturnType<typeof createRequestTrainingCatalogContext>>;

export const _putConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateTrainingView(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, TrainingView, ReturnType<typeof createRequestTrainingCatalogContext>>;

export const _deleteConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteTrainingView(ctx, id);
		return { success: true };
	}
} satisfies RouteConfig<
	Record<string, unknown>,
	{ success: true },
	ReturnType<typeof createRequestTrainingCatalogContext>
>;

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
