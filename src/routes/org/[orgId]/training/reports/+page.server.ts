import { createRequestTrainingRosterContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { TrainingReportData, TrainingReportInput } from '$features/training/contracts';
import type { PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchTrainingReportPage } from '$features/training/index.server';

const INITIAL_REPORT_INPUT: TrainingReportInput = {
	sort: { column: 'name', direction: 'asc' }
};

type LoadWithContext = typeof loadWithContext;

export interface TrainingReportsPageLoadDeps {
	loadWithContext?: LoadWithContext;
	fetchTrainingReportPage?: (
		ctx: Parameters<typeof fetchTrainingReportPage>[0],
		input: TrainingReportInput
	) => Promise<TrainingReportData>;
}

export function _createTrainingReportsPageLoad(deps: TrainingReportsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;
	const fetchTrainingReportPageFn = deps.fetchTrainingReportPage ?? fetchTrainingReportPage;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:training-reports');
		const { orgId } = params;

		return {
			trainingReport: await loadWithContextFn(locals, cookies, orgId, {
				context: createRequestTrainingRosterContext,
				policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
				policyResource: { kind: 'unscoped' },
				fn: (ctx) => fetchTrainingReportPageFn(ctx, INITIAL_REPORT_INPUT)
			})
		};
	};
}

export const load = _createTrainingReportsPageLoad();
