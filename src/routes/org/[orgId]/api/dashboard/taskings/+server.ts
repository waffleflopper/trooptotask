import type { DashboardTaskings } from '$features/dashboard/contracts';
import { fetchDashboardTaskings } from '$features/dashboard/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDashboardTaskingContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { isDateOnly } from '$lib/utils/dates';

export const _getConfig: RouteConfig<
	{ asOf: string },
	DashboardTaskings | null,
	ReturnType<typeof createRequestDashboardTaskingContext>
> = {
	context: createRequestDashboardTaskingContext,
	policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
	parseInput: (event) => {
		const asked = event.url.searchParams.get('asOf');
		return { asOf: isDateOnly(asked) ? asked : viewerToday(event.cookies) };
	},
	fn: (ctx, { asOf }) => fetchDashboardTaskings(ctx, asOf),
	formatOutput: privateJson
};

export const GET = handle(_getConfig);
