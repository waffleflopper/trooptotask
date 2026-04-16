import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCriticalTasksReportSummary } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import type { QueryPorts } from '$lib/server/core/ports';
import type { IctReportSummary } from '$features/critical-tasks/utils/ictReports';

export interface CriticalTasksReportsPageLoadDeps {
	loadWithContext?: typeof loadWithContext;
	fetchSummary?: (ctx: QueryPorts) => Promise<IctReportSummary>;
}

export function _createCriticalTasksReportsPageLoad(_deps: CriticalTasksReportsPageLoadDeps = {}) {
	const loadWithContextFn = _deps.loadWithContext ?? loadWithContext;
	const fetchSummaryFn = _deps.fetchSummary ?? ((ctx: QueryPorts) => fetchCriticalTasksReportSummary(ctx));

	return async ({ params, depends, locals, cookies }: PageServerLoadEvent) => {
		depends('app:critical-tasks-reports');
		return {
			initialSummary: await loadWithContextFn(locals, cookies, params.orgId, {
				permission: 'training',
				fn: (ctx) => fetchSummaryFn(ctx)
			})
		};
	};
}

export const load = _createCriticalTasksReportsPageLoad();
