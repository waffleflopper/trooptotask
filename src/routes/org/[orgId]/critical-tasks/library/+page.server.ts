import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';

type LoadWithContext = typeof loadWithContext;

export interface CriticalTasksLibraryPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createCriticalTasksLibraryPageLoad(deps: CriticalTasksLibraryPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:critical-tasks-library');
		const { orgId } = params;

		return {
			criticalTasksLibrary: await loadWithContextFn(locals, cookies, orgId, {
				permission: 'privileged',
				fn: async () => ({})
			})
		};
	};
}

export const load = _createCriticalTasksLibraryPageLoad();
