import { viewerToday } from '$lib/server/viewerDay.server';
import { isDateOnly } from '$lib/utils/dates';
import { createEvent, listEvents } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarEventContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestCalendarEventContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageEvents,
	policyResource: { kind: 'organization' },
	fn: (ctx, input) => createEvent(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarEventContext>>;

export const POST = handle(_postConfig);

export const _getConfig = {
	context: createRequestCalendarEventContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.viewEvents,
	policyResource: { kind: 'unscoped' },
	parseInput: (event) => {
		const asked = event.url.searchParams.get('asOf');
		return {
			today: isDateOnly(asked) ? asked : viewerToday(event.cookies),
			when: event.url.searchParams.get('when') === 'past' ? 'past' : 'upcoming'
		};
	},
	fn: async (ctx, { when, today }) => {
		const [list, workspace] = await Promise.all([listEvents(ctx, when, today), ctx.taskingWorkspace.read(today)]);
		return { ...list, workspace };
	},
	formatOutput: privateJson
} satisfies RouteConfig<
	{ today: string; when: 'upcoming' | 'past' },
	unknown,
	ReturnType<typeof createRequestCalendarEventContext>
>;
export const GET = handle(_getConfig);
