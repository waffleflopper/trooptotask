import { createRequestTrainingBriefingContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { TrainingBriefingReportData, TrainingBriefingReportInput } from '$features/training/contracts';
import { json } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchTrainingBriefingReport } from '$features/training/index.server';
import { PRIVATE_REPORT_HEADERS, parseTrainingBriefingRequest } from './reportInput';

export const _getConfig: RouteConfig<
	TrainingBriefingReportInput,
	TrainingBriefingReportData,
	ReturnType<typeof createRequestTrainingBriefingContext>
> = {
	context: createRequestTrainingBriefingContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: parseTrainingBriefingRequest,
	fn: fetchTrainingBriefingReport,
	formatOutput: (result) => json(result, { headers: PRIVATE_REPORT_HEADERS })
};

export const GET = handle(_getConfig);
