import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCriticalTasksReportsPageModel } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import type { QueryPorts } from '$lib/server/core/ports';
import type { CriticalTasksReportsPageModel } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export interface CriticalTasksReportsPageLoadDeps {
	loadWithContext?: typeof loadWithContext;
	fetchPageModel?: (ctx: QueryPorts) => Promise<CriticalTasksReportsPageModel>;
}

export function _createCriticalTasksReportsPageLoad(_deps: CriticalTasksReportsPageLoadDeps = {}) {
	const loadWithContextFn = _deps.loadWithContext ?? loadWithContext;
	const fetchPageModelFn = _deps.fetchPageModel ?? ((ctx: QueryPorts) => fetchCriticalTasksReportsPageModel(ctx));

	return async ({ params, depends, locals, cookies }: PageServerLoadEvent) => {
		depends('app:critical-tasks-reports');
		return loadWithContextFn(locals, cookies, params.orgId, {
			policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => fetchPageModelFn(ctx)
		});
	};
}

export const load = _createCriticalTasksReportsPageLoad();
