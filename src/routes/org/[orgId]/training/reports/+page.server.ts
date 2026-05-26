import type { PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	fetchTrainingReportPage,
	type TrainingReportData,
	type TrainingReportInput
} from '$lib/server/core/useCases/trainingReportsQuery';
import type { UseCaseContext } from '$lib/server/core/ports';

const INITIAL_REPORT_INPUT: TrainingReportInput = {
	sort: { column: 'name', direction: 'asc' }
};

type LoadWithContext = typeof loadWithContext;

export interface TrainingReportsPageLoadDeps {
	loadWithContext?: LoadWithContext;
	fetchTrainingReportPage?: (ctx: UseCaseContext, input: TrainingReportInput) => Promise<TrainingReportData>;
}

export function _createTrainingReportsPageLoad(deps: TrainingReportsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;
	const fetchTrainingReportPageFn = deps.fetchTrainingReportPage ?? fetchTrainingReportPage;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:training-reports');
		const { orgId } = params;

		return {
			trainingReport: await loadWithContextFn(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
				policyResource: { kind: 'unscoped' },
				fn: (ctx) => fetchTrainingReportPageFn(ctx, INITIAL_REPORT_INPUT)
			})
		};
	};
}

export const load = _createTrainingReportsPageLoad();
