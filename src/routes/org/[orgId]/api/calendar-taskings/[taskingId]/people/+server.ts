import { json } from '@sveltejs/kit';
import { loadStaffingPicker, saveTaskingPeople } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	handle,
	PRIVATE_RESPONSE_HEADERS,
	privateJson,
	readJsonBody,
	type RouteConfig
} from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';

type Context = ReturnType<typeof createRequestCalendarTaskingContext>;

export const _getConfig = {
	context: createRequestCalendarTaskingContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	parseInput: (event) => ({ id: event.params.taskingId ?? '' }),
	fn: (ctx, { id }) => loadStaffingPicker(ctx, id),
	formatOutput: privateJson
} satisfies RouteConfig<{ id: string }, unknown, Context>;

export const _putConfig = {
	context: createRequestCalendarTaskingContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageTaskings,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ id: event.params.taskingId ?? '', save: await readJsonBody(event) }),
	fn: (ctx, { id, save }) => saveTaskingPeople(ctx, id, save),
	formatOutput: (result) =>
		json(result, { status: result.outcome === 'conflict' ? 409 : 200, headers: PRIVATE_RESPONSE_HEADERS })
} satisfies RouteConfig<
	{ id: string; save: Record<string, unknown> },
	Awaited<ReturnType<typeof saveTaskingPeople>>,
	Context
>;

export const GET = handle(_getConfig);
export const PUT = handle(_putConfig);
