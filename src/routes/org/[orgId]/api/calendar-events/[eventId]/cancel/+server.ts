import { cancelEvent } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarEventContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestCalendarEventContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageEvents,
	policyResource: { kind: 'organization' },
	parseInput: async (event) => ({ id: event.params.eventId ?? '', body: await readJsonBody(event) }),
	fn: (ctx, { id, body }) => cancelEvent(ctx, id, body)
} satisfies RouteConfig<
	{ id: string; body: Record<string, unknown> },
	unknown,
	ReturnType<typeof createRequestCalendarEventContext>
>;

export const POST = handle(_postConfig);
