import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import { validateUUID } from '$lib/server/validation';
import { createTrainingType, updateTrainingType, deleteTrainingType } from '$features/training/index.server';
import type { TrainingType } from '$features/training/contracts';

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createTrainingType(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, TrainingType>;

export const _putConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateTrainingType(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, TrainingType>;

export const _deleteConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteTrainingType(
			{
				...ctx,
				notifyTrainingTypeDeleted: () =>
					ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
						type: 'config_type_deleted',
						title: 'Training Type Deleted',
						message: 'A training type was deleted.'
					})
			},
			id
		);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, { success: true }>;

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
