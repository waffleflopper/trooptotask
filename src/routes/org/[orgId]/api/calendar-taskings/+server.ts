import { viewerToday } from '$lib/server/viewerDay.server';
import { isDateOnly } from '$lib/utils/dates';
import { createTasking, listTaskings } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestCalendarTaskingContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createTasking(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarTaskingContext>>;

export const POST = handle(_postConfig);

export const _getConfig = {
	context: createRequestCalendarTaskingContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.viewEvents,
	policyResource: { kind: 'unscoped' },
	parseInput: (event) => {
		const asked = event.url.searchParams.get('asOf');
		const scope = event.url.searchParams.get('scope');
		return {
			today: isDateOnly(asked) ? asked : viewerToday(event.cookies),
			scope: scope === 'completed' || scope === 'cancelled' ? scope : 'active'
		};
	},
	fn: async (ctx, { scope, today }) => {
		const [list, workspace] = await Promise.all([listTaskings(ctx, scope), ctx.taskingWorkspace.read(today)]);
		return { ...list, workspace };
	},
	formatOutput: privateJson
} satisfies RouteConfig<
	{ today: string; scope: 'active' | 'completed' | 'cancelled' },
	unknown,
	ReturnType<typeof createRequestCalendarTaskingContext>
>;
export const GET = handle(_getConfig);
