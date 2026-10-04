import { createRequestCriticalTasksReadContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCriticalTasksReportsPageModel } from '$features/critical-tasks/index.server';
import type { CriticalTasksReportsPageModel } from '$features/critical-tasks/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export interface CriticalTasksReportsPageLoadDeps {
	loadWithContext?: typeof loadWithContext;
	fetchPageModel?: (
		ctx: Parameters<typeof fetchCriticalTasksReportsPageModel>[0]
	) => Promise<CriticalTasksReportsPageModel>;
}

export function _createCriticalTasksReportsPageLoad(_deps: CriticalTasksReportsPageLoadDeps = {}) {
	const loadWithContextFn = _deps.loadWithContext ?? loadWithContext;
	const fetchPageModelFn =
		_deps.fetchPageModel ??
		((ctx: Parameters<typeof fetchCriticalTasksReportsPageModel>[0]) => fetchCriticalTasksReportsPageModel(ctx));

	return async ({ params, depends, locals, cookies }: PageServerLoadEvent) => {
		depends('app:critical-tasks-reports');
		return loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestCriticalTasksReadContext,
			policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => fetchPageModelFn(ctx)
		});
	};
}

export const load = _createCriticalTasksReportsPageLoad();
