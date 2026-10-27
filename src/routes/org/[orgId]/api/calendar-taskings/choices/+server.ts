import { loadTaskingChoices } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';

/** The Groups and Events the Create tasking sheet offers, for a sheet opened away from the Taskings pages. */
export const _getConfig = {
	context: createRequestCalendarTaskingContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	parseInput: (event) => ({ today: viewerToday(event.cookies) }),
	fn: (ctx, { today }) => loadTaskingChoices(ctx, today),
	formatOutput: privateJson
} satisfies RouteConfig<{ today: string }, unknown, ReturnType<typeof createRequestCalendarTaskingContext>>;

export const GET = handle(_getConfig);
