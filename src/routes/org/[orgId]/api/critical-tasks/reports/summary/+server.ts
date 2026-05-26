import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchCriticalTasksReportDashboard } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	criticalTasksReportInput,
	parseCriticalTasksReportInput,
	toCriticalTasksReportInput,
	type CriticalTasksReportRouteInput
} from '../../reportInput';

export const _getConfig: RouteConfig<CriticalTasksReportRouteInput, IctReportDashboard> = {
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
	policyResource: { kind: 'unscoped' },
	input: criticalTasksReportInput,
	parseInput: (event) => parseCriticalTasksReportInput(event.url),
	fn: async (ctx, input) => fetchCriticalTasksReportDashboard(ctx, toCriticalTasksReportInput(input))
};

export const GET = handle(_getConfig);
