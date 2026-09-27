import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createWorkspaceHydrationTarget,
	type DeferredData,
	type HydrationItems,
	type WorkspaceHydrationTarget
} from '$lib/server/core/streamedWorkspace';
import { fetchCriticalTasksBootstrap } from '$lib/server/core/useCases/criticalTasksWorkspaceQuery';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$lib/types';
import type { CriticalTasksSettings, IctTask, PersonnelIctCompletion } from '../criticalTasks.types';

export const CRITICAL_TASKS_WORKSPACE_LANE_KEY = 'critical-tasks' as const;

export interface CriticalTasksWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
	includeArchivedTasks?: boolean;
}

export interface CriticalTasksWorkspaceData {
	settings: CriticalTasksSettings;
	personnel: HydrationItems<Personnel>;
	groups: HydrationItems<Group>;
	ictTasks: HydrationItems<IctTask>;
	personnelIctCompletions: HydrationItems<PersonnelIctCompletion>;
}

export type CriticalTasksWorkspaceHydrationMode = 'replace' | 'preserve-client';

export type CriticalTasksWorkspaceHydrationTarget<T> = WorkspaceHydrationTarget<T, CriticalTasksWorkspaceHydrationMode>;

export interface CriticalTasksWorkspaceHydration {
	orgId: string;
	personnel: CriticalTasksWorkspaceHydrationTarget<Personnel>;
	groups: CriticalTasksWorkspaceHydrationTarget<Group>;
	ictTasks: CriticalTasksWorkspaceHydrationTarget<IctTask>;
	personnelIctCompletions: CriticalTasksWorkspaceHydrationTarget<PersonnelIctCompletion>;
}

export interface CriticalTasksWorkspaceResult {
	laneKey: typeof CRITICAL_TASKS_WORKSPACE_LANE_KEY;
	data: CriticalTasksWorkspaceData;
	hydration: CriticalTasksWorkspaceHydration;
}

export interface CriticalTasksWorkspaceRouteData {
	criticalTasks: DeferredData<CriticalTasksWorkspaceResult>;
}

function createCriticalTasksHydrationTarget<T>(items: HydrationItems<T>): CriticalTasksWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'json' });
}

function createCriticalTasksWorkspaceHydration(
	orgId: string,
	data: CriticalTasksWorkspaceData
): CriticalTasksWorkspaceHydration {
	return {
		orgId,
		personnel: createCriticalTasksHydrationTarget(data.personnel),
		groups: createCriticalTasksHydrationTarget(data.groups),
		ictTasks: createCriticalTasksHydrationTarget(data.ictTasks),
		personnelIctCompletions: createCriticalTasksHydrationTarget(data.personnelIctCompletions)
	};
}

export async function streamCriticalTasksWorkspaceBootstrap(
	context: CriticalTasksWorkspaceRequestContext
): Promise<CriticalTasksWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const data = await fetchCriticalTasksBootstrap(ctx, {
				includeArchivedTasks: context.includeArchivedTasks
			});
			return {
				laneKey: CRITICAL_TASKS_WORKSPACE_LANE_KEY,
				data,
				hydration: createCriticalTasksWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies CriticalTasksWorkspaceResult;
		}
	});

	return {
		criticalTasks: deferred
	};
}
