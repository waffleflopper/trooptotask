import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { generateCriticalTasksReportCsv } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	PRIVATE_REPORT_HEADERS,
	criticalTasksReportInput,
	parseCriticalTasksReportInput,
	toCriticalTasksReportInput,
	type CriticalTasksReportRouteInput
} from '../../reportInput';

export const _getConfig: RouteConfig<CriticalTasksReportRouteInput, string> = {
	permission: 'critical-tasks',
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
	policyResource: { kind: 'unscoped' },
	input: criticalTasksReportInput,
	parseInput: (event) => parseCriticalTasksReportInput(event.url),
	fn: async (ctx, input) => generateCriticalTasksReportCsv(ctx, toCriticalTasksReportInput(input)),
	formatOutput: (csv) =>
		new Response('\ufeff' + csv, {
			headers: {
				...PRIVATE_REPORT_HEADERS,
				'Content-Type': 'text/csv;charset=utf-8',
				'Content-Disposition': `attachment; filename="critical-task-report-${new Date().toISOString().split('T')[0]}.csv"`
			}
		})
};

export const GET = handle(_getConfig);
