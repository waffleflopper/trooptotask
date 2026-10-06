import { createRequestTrainingBriefingContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { TrainingBriefingDetail, TrainingBriefingDetailInput } from '$features/training/contracts';
import { json } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchTrainingBriefingDetail } from '$features/training/index.server';
import {
	PRIVATE_REPORT_HEADERS,
	parseTrainingBriefingDetailRequest,
	trainingBriefingDetailInput
} from '../reportInput';

export const _getDetailConfig: RouteConfig<
	TrainingBriefingDetailInput,
	TrainingBriefingDetail,
	ReturnType<typeof createRequestTrainingBriefingContext>
> = {
	context: createRequestTrainingBriefingContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	input: trainingBriefingDetailInput,
	parseInput: (event) => parseTrainingBriefingDetailRequest(event) as TrainingBriefingDetailInput,
	fn: fetchTrainingBriefingDetail,
	formatOutput: (result) => json(result, { headers: PRIVATE_REPORT_HEADERS })
};

export const GET = handle(_getDetailConfig);
