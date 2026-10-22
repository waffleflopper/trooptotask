import { commitRosterReplacement } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterPlannerContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestRosterPlannerContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => commitRosterReplacement(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterPlannerContext>>;

export const POST = handle(_postConfig);
