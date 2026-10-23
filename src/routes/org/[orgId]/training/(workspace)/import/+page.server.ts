import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestEmptyContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface TrainingImportPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createTrainingImportPageLoad(deps: TrainingImportPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:training-import');
		const { orgId } = params;

		return {
			trainingImport: await loadWithContextFn(locals, cookies, orgId, {
				context: createRequestEmptyContext,
				policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
				policyResource: { kind: 'unscoped' },
				fn: async () => ({})
			})
		};
	};
}

export const load = _createTrainingImportPageLoad();
