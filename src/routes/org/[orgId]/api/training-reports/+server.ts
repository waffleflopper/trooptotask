import { createRequestTrainingBriefingContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { TrainingBriefingReportData, TrainingBriefingReportInput } from '$features/training/contracts';
import { json } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, PRIVATE_RESPONSE_HEADERS, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchTrainingBriefingReport } from '$features/training/index.server';
import { parseTrainingBriefingRequest, type ViewerDayRequest } from './reportInput';

export const _getConfig: RouteConfig<
	ViewerDayRequest<TrainingBriefingReportInput>,
	TrainingBriefingReportData,
	ReturnType<typeof createRequestTrainingBriefingContext>
> = {
	context: createRequestTrainingBriefingContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: parseTrainingBriefingRequest,
	fn: (ctx, { request, asOf }) => fetchTrainingBriefingReport(ctx, request, asOf),
	formatOutput: (result) => json(result, { headers: PRIVATE_RESPONSE_HEADERS })
};

export const GET = handle(_getConfig);
