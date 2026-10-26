import { transitionTasking } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestCalendarTaskingContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ id: event.params.taskingId ?? '', body: await readJsonBody(event) }),
	fn: (ctx, { id, body }) => transitionTasking(ctx, id, body)
} satisfies RouteConfig<
	{ id: string; body: Record<string, unknown> },
	unknown,
	ReturnType<typeof createRequestCalendarTaskingContext>
>;

export const POST = handle(_postConfig);
