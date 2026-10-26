import { createEvent } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarEventContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestCalendarEventContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageEvents,
	policyResource: { kind: 'organization' },
	fn: (ctx, input) => createEvent(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarEventContext>>;

export const POST = handle(_postConfig);
