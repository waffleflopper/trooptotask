import { createRequestCriticalTasksReadContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCriticalTasksReportsPageModel } from '$features/critical-tasks/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { viewerTimeZone, viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';

export interface CriticalTasksReportsPageLoadDeps {
	loadWithContext?: typeof loadWithContext;
	fetchPageModel?: typeof fetchCriticalTasksReportsPageModel;
}

export function _createCriticalTasksReportsPageLoad(_deps: CriticalTasksReportsPageLoadDeps = {}) {
	const loadWithContextFn = _deps.loadWithContext ?? loadWithContext;
	const fetchPageModelFn = _deps.fetchPageModel ?? fetchCriticalTasksReportsPageModel;

	return async ({ params, depends, locals, cookies }: PageServerLoadEvent) => {
		depends('app:critical-tasks-reports', VIEWER_DAY_DEPENDENCY);
		const asOf = viewerToday(cookies);
		const timeZone = viewerTimeZone(cookies);
		return loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestCriticalTasksReadContext,
			policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => fetchPageModelFn(ctx, { asOf, timeZone })
		});
	};
}

export const load = _createCriticalTasksReportsPageLoad();
