import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchCriticalTasksReportSummary } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import type { IctReportSummary } from '$features/critical-tasks/utils/ictReports';
import {
	criticalTasksReportInput,
	parseCriticalTasksReportInput,
	toCriticalTasksReportInput,
	type CriticalTasksReportRouteInput
} from '../../reportInput';

export const _getConfig: RouteConfig<CriticalTasksReportRouteInput, IctReportSummary> = {
	permission: 'training',
	input: criticalTasksReportInput,
	parseInput: (event) => parseCriticalTasksReportInput(event.url),
	fn: async (ctx, input) => fetchCriticalTasksReportSummary(ctx, toCriticalTasksReportInput(input))
};

export const GET = handle(_getConfig);
