import { loadRosterDay } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterSettingsContext } from '$lib/server/adapters/requestContexts.server';

export const _getConfig = {
	context: createRequestRosterSettingsContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	parseInput: (event) => ({
		typeId: event.url.searchParams.get('typeId') ?? '',
		today: event.url.searchParams.get('today') ?? '',
		date: event.url.searchParams.get('date') ?? ''
	}),
	fn: (ctx, input) => loadRosterDay(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterSettingsContext>>;

export const GET = handle(_getConfig);
