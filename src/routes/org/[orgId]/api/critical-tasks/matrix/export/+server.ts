import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { generateCriticalTasksMatrixCsv } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	PRIVATE_REPORT_HEADERS,
	criticalTasksMatrixExportInput,
	parseCriticalTasksMatrixExportInput,
	toCriticalTasksMatrixExportInput,
	type CriticalTasksMatrixExportRouteInput
} from '../../reportInput';

export const _getConfig: RouteConfig<CriticalTasksMatrixExportRouteInput, string> = {
	permission: 'critical-tasks',
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
	policyResource: { kind: 'unscoped' },
	input: criticalTasksMatrixExportInput,
	parseInput: (event) => parseCriticalTasksMatrixExportInput(event.url),
	fn: async (ctx, input) => generateCriticalTasksMatrixCsv(ctx, toCriticalTasksMatrixExportInput(input)),
	formatOutput: (csv) =>
		new Response('\ufeff' + csv, {
			headers: {
				...PRIVATE_REPORT_HEADERS,
				'Content-Type': 'text/csv;charset=utf-8',
				'Content-Disposition': `attachment; filename="critical-task-matrix-${new Date().toISOString().split('T')[0]}.csv"`
			}
		})
};

export const GET = handle(_getConfig);
