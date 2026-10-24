import { commitRosterSwap, previewRosterSwap, undoRosterSwap } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterPlannerContext } from '$lib/server/adapters/requestContexts.server';

export const _getConfig = {
	context: createRequestRosterPlannerContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	parseInput: (event) => ({
		typeId: event.url.searchParams.get('typeId') ?? '',
		today: event.url.searchParams.get('today') ?? '',
		date: event.url.searchParams.get('date') ?? ''
	}),
	fn: (ctx, input) => previewRosterSwap(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterPlannerContext>>;

export const _postConfig = {
	context: createRequestRosterPlannerContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => commitRosterSwap(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterPlannerContext>>;

export const _deleteConfig = {
	context: createRequestRosterPlannerContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => undoRosterSwap(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterPlannerContext>>;

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
export const DELETE = handle(_deleteConfig);
