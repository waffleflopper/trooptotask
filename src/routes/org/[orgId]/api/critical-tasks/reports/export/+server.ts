import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	generateCriticalTasksReportWorkbookExport,
	type CriticalTasksWorkbookExport
} from '$lib/server/core/useCases/criticalTasksReportsQuery';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { workbookBufferResponse } from '$lib/export/workbook';
import {
	PRIVATE_REPORT_HEADERS,
	criticalTasksReportInput,
	parseCriticalTasksReportInput,
	toCriticalTasksReportInput,
	type CriticalTasksReportRouteInput
} from '../../reportInput';

export const _getConfig: RouteConfig<CriticalTasksReportRouteInput, CriticalTasksWorkbookExport> = {
	permission: 'critical-tasks',
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
	policyResource: { kind: 'unscoped' },
	input: criticalTasksReportInput,
	parseInput: (event) => parseCriticalTasksReportInput(event.url),
	fn: async (ctx, input) => generateCriticalTasksReportWorkbookExport(ctx, toCriticalTasksReportInput(input)),
	formatOutput: (result) => workbookBufferResponse(result.buffer, result.filename, PRIVATE_REPORT_HEADERS)
};

export const GET = handle(_getConfig);
