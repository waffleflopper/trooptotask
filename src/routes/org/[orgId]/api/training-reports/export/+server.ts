import { createRequestTrainingBriefingContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { TrainingBriefingReportInput, TrainingReportWorkbookExport } from '$features/training/contracts';
import { handle, PRIVATE_RESPONSE_HEADERS, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { generateTrainingReportWorkbookExport } from '$features/training/index.server';
import { workbookBufferResponse } from '$lib/utils/workbook';
import { parseTrainingBriefingRequest, type ViewerDayRequest } from '../reportInput';

export const _getConfig: RouteConfig<
	ViewerDayRequest<TrainingBriefingReportInput>,
	TrainingReportWorkbookExport,
	ReturnType<typeof createRequestTrainingBriefingContext>
> = {
	context: createRequestTrainingBriefingContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: parseTrainingBriefingRequest,
	fn: (ctx, { request, asOf }) => generateTrainingReportWorkbookExport(ctx, request, asOf),
	formatOutput: (result) => workbookBufferResponse(result.buffer, result.filename, PRIVATE_RESPONSE_HEADERS)
};

export const GET = handle(_getConfig);
