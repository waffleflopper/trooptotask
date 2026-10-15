import { setStatusTypeOrder } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarCatalogContext } from '$lib/server/adapters/requestContexts.server';

export const _putConfig = {
	context: createRequestCalendarCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		await setStatusTypeOrder(ctx, input);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>;

export const PUT = handle(_putConfig);
