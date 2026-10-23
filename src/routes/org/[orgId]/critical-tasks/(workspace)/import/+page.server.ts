import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestEmptyContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface CriticalTasksImportPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createCriticalTasksImportPageLoad(deps: CriticalTasksImportPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:critical-tasks-import');
		const { orgId } = params;

		return {
			criticalTasksImport: await loadWithContextFn(locals, cookies, orgId, {
				context: createRequestEmptyContext,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'unscoped' },
				fn: async () => ({})
			})
		};
	};
}

export const load = _createCriticalTasksImportPageLoad();
