import { createRequestTrainingBriefingContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { TrainingBriefingDetail, TrainingBriefingDetailInput } from '$features/training/contracts';
import { json } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, PRIVATE_RESPONSE_HEADERS, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchTrainingBriefingDetail } from '$features/training/index.server';
import {
	parseTrainingBriefingDetailRequest,
	trainingBriefingDetailRequest,
	type ViewerDayRequest
} from '../reportInput';

export const _getDetailConfig: RouteConfig<
	ViewerDayRequest<TrainingBriefingDetailInput>,
	TrainingBriefingDetail,
	ReturnType<typeof createRequestTrainingBriefingContext>
> = {
	context: createRequestTrainingBriefingContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	input: trainingBriefingDetailRequest,
	parseInput: (event) => parseTrainingBriefingDetailRequest(event) as ViewerDayRequest<TrainingBriefingDetailInput>,
	fn: (ctx, { request, asOf }) => fetchTrainingBriefingDetail(ctx, request, asOf),
	formatOutput: (result) => json(result, { headers: PRIVATE_RESPONSE_HEADERS })
};

export const GET = handle(_getDetailConfig);
