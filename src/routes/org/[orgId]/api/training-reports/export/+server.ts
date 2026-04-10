import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { generateTrainingReportCsv } from '$lib/server/core/useCases/trainingReportsQuery';
import {
	PRIVATE_REPORT_HEADERS,
	parseTrainingReportInput,
	toTrainingReportInput,
	trainingReportInput,
	type TrainingReportRouteInput
} from '../reportInput';

export const _getConfig: RouteConfig<TrainingReportRouteInput, string> = {
	permission: 'training',
	input: trainingReportInput,
	parseInput: (event) => parseTrainingReportInput(event.url),
	fn: async (ctx, input) => generateTrainingReportCsv(ctx, toTrainingReportInput(input)),
	formatOutput: (csv) =>
		new Response('\ufeff' + csv, {
			headers: {
				...PRIVATE_REPORT_HEADERS,
				'Content-Type': 'text/csv;charset=utf-8',
				'Content-Disposition': `attachment; filename="training-report-${new Date().toISOString().split('T')[0]}.csv"`
			}
		})
};

export const GET = handle(_getConfig);
