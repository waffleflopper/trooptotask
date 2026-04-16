import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { UseCaseContext } from '$lib/server/core/ports';

export interface CriticalTasksReportsPageLoadDeps {
	loadWithContext?: typeof loadWithContext;
}

export function _createCriticalTasksReportsPageLoad(deps: CriticalTasksReportsPageLoadDeps = {}): PageServerLoad {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }) => {
		depends('app:critical-tasks-reports');
		const { orgId } = params;

		return {
			session: locals.session,
			reportAccess: await loadWithContextFn(locals, cookies, orgId, {
				permission: 'training',
				fn: async (_ctx: UseCaseContext) => true
			})
		};
	};
}

export const load = _createCriticalTasksReportsPageLoad();
