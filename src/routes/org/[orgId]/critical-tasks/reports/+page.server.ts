import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCriticalTasksReportDashboard } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import type { QueryPorts } from '$lib/server/core/ports';
import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';

export interface CriticalTasksReportsPageLoadDeps {
	loadWithContext?: typeof loadWithContext;
	fetchDashboard?: (ctx: QueryPorts) => Promise<IctReportDashboard>;
}

export function _createCriticalTasksReportsPageLoad(_deps: CriticalTasksReportsPageLoadDeps = {}) {
	const loadWithContextFn = _deps.loadWithContext ?? loadWithContext;
	const fetchDashboardFn = _deps.fetchDashboard ?? ((ctx: QueryPorts) => fetchCriticalTasksReportDashboard(ctx));

	return async ({ params, depends, locals, cookies }: PageServerLoadEvent) => {
		depends('app:critical-tasks-reports');
		return {
			initialDashboard: await loadWithContextFn(locals, cookies, params.orgId, {
				permission: 'critical-tasks',
				fn: (ctx) => fetchDashboardFn(ctx)
			})
		};
	};
}

export const load = _createCriticalTasksReportsPageLoad();
