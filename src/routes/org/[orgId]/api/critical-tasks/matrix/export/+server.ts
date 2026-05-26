import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	generateCriticalTasksMatrixWorkbookExport,
	type CriticalTasksWorkbookExport
} from '$lib/server/core/useCases/criticalTasksReportsQuery';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { workbookBufferResponse } from '$lib/export/workbook';
import {
	PRIVATE_REPORT_HEADERS,
	criticalTasksMatrixExportInput,
	parseCriticalTasksMatrixExportInput,
	toCriticalTasksMatrixExportInput,
	type CriticalTasksMatrixExportRouteInput
} from '../../reportInput';

export const _getConfig: RouteConfig<CriticalTasksMatrixExportRouteInput, CriticalTasksWorkbookExport> = {
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
	policyResource: { kind: 'unscoped' },
	input: criticalTasksMatrixExportInput,
	parseInput: (event) => parseCriticalTasksMatrixExportInput(event.url),
	fn: async (ctx, input) => generateCriticalTasksMatrixWorkbookExport(ctx, toCriticalTasksMatrixExportInput(input)),
	formatOutput: (result) => workbookBufferResponse(result.buffer, result.filename, PRIVATE_REPORT_HEADERS)
};

export const GET = handle(_getConfig);
