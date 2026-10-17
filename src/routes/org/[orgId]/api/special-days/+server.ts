import {
	addClosureDays,
	deleteSpecialDay,
	listSpecialDays,
	resetFederalHolidays,
	updateSpecialDay
} from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarCatalogContext } from '$lib/server/adapters/requestContexts.server';
import { validateUUID } from '$lib/server/validation';

export const _getConfig = {
	context: createRequestCalendarCatalogContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: (ctx) => listSpecialDays(ctx.calendarCatalogs)
} satisfies RouteConfig<void, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>;

export const _postConfig = {
	context: createRequestCalendarCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: async (ctx, input) => {
		if (input.action === 'addClosureDays') return addClosureDays(ctx, input);
		if (input.action === 'resetFederalHolidays') return resetFederalHolidays(ctx);
		fail(400, 'Unknown special day action');
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>;

export const _putConfig = {
	context: createRequestCalendarCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: (ctx, input) => updateSpecialDay(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>;

export const _deleteConfig = {
	context: createRequestCalendarCatalogContext,
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
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>;

export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
export const GET = handle(_getConfig);

export const POST = handle<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>(
	_postConfig
);
