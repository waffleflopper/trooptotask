import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	generateCriticalTasksReportWorkbookExport,
	type CriticalTasksWorkbookExport
} from '$lib/server/core/useCases/criticalTasksReportsQuery';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { contentDispositionAttachment, WORKBOOK_MIME_TYPE } from '$lib/export/workbook';
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
	formatOutput: (result) =>
		new Response(result.buffer, {
			headers: {
				...PRIVATE_REPORT_HEADERS,
				'Content-Type': WORKBOOK_MIME_TYPE,
				'Content-Disposition': contentDispositionAttachment(result.filename)
			}
		})
};

export const GET = handle(_getConfig);
