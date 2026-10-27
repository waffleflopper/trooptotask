import { deleteEvent, updateEvent } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarEventContext } from '$lib/server/adapters/requestContexts.server';

export const _patchConfig = {
	context: createRequestCalendarEventContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageEvents,
	policyResource: { kind: 'organization' },
	parseInput: async (event) => ({ id: event.params.eventId ?? '', draft: await readJsonBody(event) }),
	fn: (ctx, { id, draft }) => updateEvent(ctx, id, draft)
} satisfies RouteConfig<
	{ id: string; draft: Record<string, unknown> },
	unknown,
	ReturnType<typeof createRequestCalendarEventContext>
>;

export const PATCH = handle(_patchConfig);

export const _deleteConfig = {
	context: createRequestCalendarEventContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageEvents,
	policyResource: { kind: 'organization' },
	parseInput: async (event) => ({ id: event.params.eventId ?? '', body: await readJsonBody(event) }),
	fn: (ctx, { id, body }) => deleteEvent(ctx, id, body)
} satisfies RouteConfig<
	{ id: string; body: Record<string, unknown> },
	unknown,
	ReturnType<typeof createRequestCalendarEventContext>
>;

export const DELETE = handle(_deleteConfig);
