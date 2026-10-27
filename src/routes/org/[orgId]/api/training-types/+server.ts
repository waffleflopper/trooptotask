import { createRequestTrainingCatalogContext } from '$lib/server/adapters/featureRequestContexts.server';
import { createRequestTrainingTypeDeletionContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import { validateUUID } from '$lib/server/validation';
import {
	createTrainingType,
	updateTrainingType,
	deleteTrainingType,
	listTrainingTypes
} from '$features/training/index.server';
import type { TrainingType } from '$features/training/contracts';

export const _getConfig = {
	context: createRequestTrainingCatalogContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewMatrix,
	policyResource: { kind: 'organization' as const },
	fn: listTrainingTypes,
	formatOutput: privateJson
};

export const _postConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createTrainingType(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, TrainingType, ReturnType<typeof createRequestTrainingCatalogContext>>;

export const _putConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateTrainingType(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, TrainingType, ReturnType<typeof createRequestTrainingCatalogContext>>;

export const _deleteConfig = {
	context: createRequestTrainingTypeDeletionContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteTrainingType(ctx, id);
		return { success: true };
	}
} satisfies RouteConfig<
	Record<string, unknown>,
	{ success: true },
	ReturnType<typeof createRequestTrainingTypeDeletionContext>
>;

export const POST = handle(_postConfig);
export const GET = handle(_getConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
