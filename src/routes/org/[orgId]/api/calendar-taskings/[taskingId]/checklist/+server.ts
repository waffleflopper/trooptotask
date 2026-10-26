import { addChecklistItem, reorderTaskingList } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';

type Context = ReturnType<typeof createRequestCalendarTaskingContext>;
type Input = { taskingId: string; body: Record<string, unknown> };

const parseInput = async (event: Parameters<typeof readJsonBody>[0] & { params: { taskingId?: string } }) => ({
	taskingId: event.params.taskingId ?? '',
	body: await readJsonBody(event)
});

export const _postConfig = {
	context: createRequestCalendarTaskingContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	parseInput,
	fn: (ctx, { taskingId, body }) => addChecklistItem(ctx, taskingId, body)
} satisfies RouteConfig<Input, unknown, Context>;

export const _putConfig = {
	..._postConfig,
	fn: (ctx, { taskingId, body }) => reorderTaskingList(ctx, taskingId, 'checklist', body)
} satisfies RouteConfig<Input, unknown, Context>;

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
