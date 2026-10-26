import { fetchDashboardTaskingAttention } from '$features/dashboard/index.server';
import type { TaskingAttentionProjection } from '$features/calendar';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDashboardTaskingContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';

export const _getConfig: RouteConfig<
	{ asOf: string },
	TaskingAttentionProjection | null,
	ReturnType<typeof createRequestDashboardTaskingContext>
> = {
	context: createRequestDashboardTaskingContext,
	policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
	parseInput: (event) => ({ asOf: viewerToday(event.cookies) }),
	fn: (ctx, { asOf }) => fetchDashboardTaskingAttention(ctx, asOf),
	formatOutput: privateJson
};

export const GET = handle(_getConfig);
