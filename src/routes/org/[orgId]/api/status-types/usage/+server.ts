import { readStatusTypeUsage } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarCatalogContext } from '$lib/server/adapters/requestContexts.server';

export const _getConfig = {
	context: createRequestCalendarCatalogContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx) => readStatusTypeUsage(ctx),
	formatOutput: privateJson
} satisfies RouteConfig<void, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>;

export const GET = handle(_getConfig);
