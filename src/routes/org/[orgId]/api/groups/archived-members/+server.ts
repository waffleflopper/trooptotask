import { countArchivedGroupMembers } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestGroupContext } from '$lib/server/adapters/requestContexts.server';

export const _getConfig: RouteConfig<
	Record<string, unknown>,
	{ count: number },
	ReturnType<typeof createRequestGroupContext>
> = {
	context: createRequestGroupContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageGroups,
	policyResource: { kind: 'unscoped' },
	mutation: false,
	parseInput: (event) => ({ groupId: event.url.searchParams.get('groupId') ?? '' }),
	fn: countArchivedGroupMembers
};

export const GET = handle(_getConfig);
