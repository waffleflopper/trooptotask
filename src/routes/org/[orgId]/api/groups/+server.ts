import { createGroup, deleteGroup, updateGroup } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestGroupContext } from '$lib/server/adapters/requestContexts.server';
import { validateUUID } from '$lib/server/validation';

const groupManagement = {
	context: createRequestGroupContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageGroups,
	policyResource: { kind: 'unscoped' as const }
};

export const _postConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestGroupContext>
> = {
	...groupManagement,
	fn: createGroup
};
export const POST = handle(_postConfig);

export const _putConfig: RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestGroupContext>> = {
	...groupManagement,
	fn: updateGroup
};
export const PUT = handle(_putConfig);

export const _deleteConfig: RouteConfig<
	Record<string, unknown>,
	{ success: true },
	ReturnType<typeof createRequestGroupContext>
> = {
	...groupManagement,
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteGroup(ctx, id);
		return { success: true };
	}
};
export const DELETE = handle(_deleteConfig);
