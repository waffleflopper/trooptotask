import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCriticalTasksPersonnelHistory } from '$lib/server/core/useCases/criticalTasksHistoryQuery';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { CriticalTasksPersonnelHistoryData } from '$features/critical-tasks/criticalTasks.types';

type LoadWithContext = typeof loadWithContext;

export interface CriticalTasksPersonnelHistoryPageLoadDeps {
	loadWithContext?: LoadWithContext;
	fetchHistory?: (ctx: UseCaseContext, personnelId: string) => Promise<CriticalTasksPersonnelHistoryData>;
}

export function _createCriticalTasksPersonnelHistoryPageLoad(deps: CriticalTasksPersonnelHistoryPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;
	const fetchHistoryFn = deps.fetchHistory ?? fetchCriticalTasksPersonnelHistory;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:critical-tasks-personnel-history');
		const { orgId, personnelId } = params;

		return {
			orgId,
			criticalTasksPersonnelHistory: await loadWithContextFn(locals, cookies, orgId, {
				permission: 'critical-tasks',
				fn: (ctx) => fetchHistoryFn(ctx, personnelId)
			})
		};
	};
}

export const load = _createCriticalTasksPersonnelHistoryPageLoad();
