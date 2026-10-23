import { loadStartingNumbersStatus, saveStartingNumbers } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	createRequestRosterPlannerContext,
	createRequestRosterSettingsContext
} from '$lib/server/adapters/requestContexts.server';

export const _getConfig = {
	context: createRequestRosterSettingsContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
	policyResource: { kind: 'unscoped' },
	parseInput: (event) => ({
		typeId: event.url.searchParams.get('typeId') ?? '',
		today: event.url.searchParams.get('today') ?? ''
	}),
	fn: (ctx, input) => loadStartingNumbersStatus(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterSettingsContext>>;

export const _postConfig = {
	context: createRequestRosterPlannerContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => saveStartingNumbers(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterPlannerContext>>;

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
