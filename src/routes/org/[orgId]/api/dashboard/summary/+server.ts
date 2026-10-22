import { refreshDashboardSummary } from '$features/dashboard/index.server';
import type { DashboardPageSummaryData } from '$features/dashboard/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDashboardSummaryContext } from '$lib/server/adapters/requestContexts.server';
import { viewerTimeZone, viewerToday } from '$lib/server/viewerDay.server';

interface DashboardSummaryInput {
	asOf: string;
	timeZone: string;
}

export const _getConfig: RouteConfig<
	DashboardSummaryInput,
	DashboardPageSummaryData,
	ReturnType<typeof createRequestDashboardSummaryContext>
> = {
	context: createRequestDashboardSummaryContext,
	policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
	parseInput: (event) => ({ asOf: viewerToday(event.cookies), timeZone: viewerTimeZone(event.cookies) }),
	fn: (ctx, { asOf, timeZone }) => refreshDashboardSummary(ctx, asOf, timeZone)
};

export const GET = handle(_getConfig);
