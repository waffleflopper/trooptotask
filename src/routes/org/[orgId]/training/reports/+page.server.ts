import { createRequestTrainingBriefingContext } from '$lib/server/adapters/featureRequestContexts.server';
import {
	parseTrainingBriefingReportInput,
	type TrainingBriefingReportData,
	type TrainingBriefingReportInput
} from '$features/training/contracts';
import type { PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import { fetchTrainingBriefingReport } from '$features/training/index.server';

type LoadWithContext = typeof loadWithContext;

export interface TrainingReportsPageLoadDeps {
	loadWithContext?: LoadWithContext;
	fetchTrainingBriefingReport?: (
		ctx: Parameters<typeof fetchTrainingBriefingReport>[0],
		input: TrainingBriefingReportInput,
		asOf: string
	) => Promise<TrainingBriefingReportData>;
}

export function _createTrainingReportsPageLoad(deps: TrainingReportsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;
	const fetchReport = deps.fetchTrainingBriefingReport ?? fetchTrainingBriefingReport;

	return async ({ params, url, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:training-reports', VIEWER_DAY_DEPENDENCY);
		const input = parseTrainingBriefingReportInput(url.searchParams);
		const asOf = viewerToday(cookies);

		return {
			trainingReport: await loadWithContextFn(locals, cookies, params.orgId, {
				context: createRequestTrainingBriefingContext,
				policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
				policyResource: { kind: 'unscoped' },
				fn: (ctx) => fetchReport(ctx, input, asOf)
			})
		};
	};
}

export const load = _createTrainingReportsPageLoad();
