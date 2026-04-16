import type { PageServerLoad } from './$types';

export interface CriticalTasksReportsPageLoadDeps {
	loadWithContext?: unknown;
}

export function _createCriticalTasksReportsPageLoad(_deps: CriticalTasksReportsPageLoadDeps = {}): PageServerLoad {
	return async ({ depends, locals }) => {
		depends('app:critical-tasks-reports');
		return {
			session: locals.session
		};
	};
}

export const load = _createCriticalTasksReportsPageLoad();
