import { updateChecklistItem, removeChecklistItem } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';

type Context = ReturnType<typeof createRequestCalendarTaskingContext>;
type Params = { taskingId: string; itemId: string };

const params = (event: { params: { taskingId?: string; itemId?: string } }): Params => ({
	taskingId: event.params.taskingId ?? '',
	itemId: event.params.itemId ?? ''
});

export const _patchConfig = {
	context: createRequestCalendarTaskingContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ ...params(event), body: await readJsonBody(event) }),
	fn: (ctx, { taskingId, itemId, body }) => updateChecklistItem(ctx, taskingId, itemId, body)
} satisfies RouteConfig<Params & { body: Record<string, unknown> }, unknown, Context>;

export const _deleteConfig = {
	context: createRequestCalendarTaskingContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => params(event),
	fn: (ctx, { taskingId, itemId }) => removeChecklistItem(ctx, taskingId, itemId)
} satisfies RouteConfig<Params, unknown, Context>;

export const PATCH = handle(_patchConfig);
export const DELETE = handle(_deleteConfig);
