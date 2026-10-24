import { createGroup, deleteGroup, readGroupEditorCatalog, renameGroup } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestGroupContext } from '$lib/server/adapters/requestContexts.server';

const groupManagement = {
	context: createRequestGroupContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageGroups,
	policyResource: { kind: 'unscoped' as const }
};

type GroupRoute<Output> = RouteConfig<Record<string, unknown>, Output, ReturnType<typeof createRequestGroupContext>>;

export const _getConfig: RouteConfig<void, unknown, ReturnType<typeof createRequestGroupContext>> = {
	...groupManagement,
	mutation: false,
	fn: readGroupEditorCatalog
};
export const GET = handle(_getConfig);

export const _postConfig: GroupRoute<unknown> = { ...groupManagement, fn: createGroup };
export const POST = handle(_postConfig);

export const _putConfig: GroupRoute<unknown> = { ...groupManagement, fn: renameGroup };
export const PUT = handle(_putConfig);

export const _deleteConfig: GroupRoute<{ movedCount: number }> = { ...groupManagement, fn: deleteGroup };
export const DELETE = handle(_deleteConfig);
