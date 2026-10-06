import {
	createSpecialDay,
	deleteSpecialDay,
	listSpecialDays,
	resetFederalHolidays,
	updateSpecialDay
} from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestWriteContext } from '$lib/server/adapters/requestContexts.server';
import { validateUUID } from '$lib/server/validation';

export const _getConfig = {
	context: createRequestWriteContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: (ctx) => listSpecialDays(ctx.store, ctx.auth.orgId)
} satisfies RouteConfig<void, unknown, ReturnType<typeof createRequestWriteContext>>;

export const _postConfig = {
	context: createRequestWriteContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: async (ctx, input) => {
		if (input.action === 'resetFederalHolidays') {
			return resetFederalHolidays(ctx);
		}
		return createSpecialDay(ctx, input);
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestWriteContext>>;

export const _putConfig = {
	context: createRequestWriteContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: (ctx, input) => updateSpecialDay(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestWriteContext>>;

export const _deleteConfig = {
	context: createRequestWriteContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteSpecialDay(ctx, id);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestWriteContext>>;

export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
export const GET = handle(_getConfig);

export const POST = handle<Record<string, unknown>, unknown, ReturnType<typeof createRequestWriteContext>>(_postConfig);
