import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestEmptyContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface CriticalTasksLibraryImportPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createCriticalTasksLibraryImportPageLoad(deps: CriticalTasksLibraryImportPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:critical-tasks-library-import');
		const { orgId } = params;

		return {
			criticalTasksLibraryImport: await loadWithContextFn(locals, cookies, orgId, {
				context: createRequestEmptyContext,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
				fn: async () => ({})
			})
		};
	};
}

export const load = _createCriticalTasksLibraryImportPageLoad();
