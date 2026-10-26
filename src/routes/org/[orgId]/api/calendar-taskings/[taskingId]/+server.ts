import { updateTasking } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';

export const _patchConfig = {
	context: createRequestCalendarTaskingContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ id: event.params.taskingId ?? '', draft: await readJsonBody(event) }),
	fn: (ctx, { id, draft }) => updateTasking(ctx, id, draft)
} satisfies RouteConfig<
	{ id: string; draft: Record<string, unknown> },
	unknown,
	ReturnType<typeof createRequestCalendarTaskingContext>
>;

export const PATCH = handle(_patchConfig);
