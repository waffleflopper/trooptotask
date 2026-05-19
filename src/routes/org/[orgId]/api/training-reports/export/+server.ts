import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	generateTrainingReportWorkbookExport,
	type TrainingReportWorkbookExport
} from '$lib/server/core/useCases/trainingReportsQuery';
import { contentDispositionAttachment, WORKBOOK_MIME_TYPE } from '$lib/export/workbook';
import {
	PRIVATE_REPORT_HEADERS,
	parseTrainingReportInput,
	toTrainingReportInput,
	trainingReportInput,
	type TrainingReportRouteInput
} from '../reportInput';

export const _getConfig: RouteConfig<TrainingReportRouteInput, TrainingReportWorkbookExport> = {
	permission: 'training',
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	input: trainingReportInput,
	parseInput: (event) => parseTrainingReportInput(event.url),
	fn: async (ctx, input) => generateTrainingReportWorkbookExport(ctx, toTrainingReportInput(input)),
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
