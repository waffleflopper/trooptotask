import { createRequestTrainingRosterContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { TrainingReportDetail } from '$features/training/contracts';
import { json } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchTrainingReportDetailPage } from '$features/training/index.server';
import {
	PRIVATE_REPORT_HEADERS,
	parseTrainingReportInput,
	toTrainingReportInput,
	trainingReportInput,
	type TrainingReportRouteInput
} from '../reportInput';

export const _getDetailConfig: RouteConfig<
	TrainingReportRouteInput,
	TrainingReportDetail,
	ReturnType<typeof createRequestTrainingRosterContext>
> = {
	context: createRequestTrainingRosterContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	input: trainingReportInput,
	parseInput: (event) => parseTrainingReportInput(event.url),
	fn: async (ctx, input) => fetchTrainingReportDetailPage(ctx, toTrainingReportInput(input)),
	formatOutput: (result) => json(result, { headers: PRIVATE_REPORT_HEADERS })
};

export const GET = handle(_getDetailConfig);
