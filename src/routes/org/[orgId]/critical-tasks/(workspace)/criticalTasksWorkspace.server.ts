import { createRequestCriticalTasksReadContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { Cookies } from '@sveltejs/kit';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createWorkspaceHydrationTarget,
	settleWorkspaceDenial,
	type DeferredData,
	type HydrationItems
} from '$lib/server/adapters/streamedWorkspace';
import {
	CRITICAL_TASKS_WORKSPACE_LANE_KEY,
	type CriticalTasksWorkspaceData,
	type CriticalTasksWorkspaceHydration,
	type CriticalTasksWorkspaceHydrationTarget,
	type CriticalTasksWorkspaceRestricted,
	type CriticalTasksWorkspaceResult
} from '$features/critical-tasks/contracts';
import { fetchCriticalTasksBootstrap } from '$features/critical-tasks/index.server';

export interface CriticalTasksWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface CriticalTasksWorkspaceRouteData {
	criticalTasks: DeferredData<CriticalTasksWorkspaceResult | CriticalTasksWorkspaceRestricted>;
}

function createCriticalTasksHydrationTarget<T>(items: HydrationItems<T>): CriticalTasksWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'hash' });
}

function createCriticalTasksWorkspaceHydration(
	orgId: string,
	data: CriticalTasksWorkspaceData
): CriticalTasksWorkspaceHydration {
	return {
		orgId,
		personnel: createCriticalTasksHydrationTarget(data.personnel),
		groups: createCriticalTasksHydrationTarget(data.groups),
		pinnedGroups: createCriticalTasksHydrationTarget(data.pinnedGroups),
		ictTasks: createCriticalTasksHydrationTarget(data.ictTasks),
		personnelIctCompletions: createCriticalTasksHydrationTarget(data.personnelIctCompletions)
	};
}

export async function streamCriticalTasksWorkspaceBootstrap(
	context: CriticalTasksWorkspaceRequestContext
): Promise<CriticalTasksWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: createRequestCriticalTasksReadContext,
		policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const data = await fetchCriticalTasksBootstrap(ctx, {
				includeArchivedTasks: evaluatePolicyDecision({
					decisionKind: 'server-authoritative',
					actor: { membershipRole: ctx.auth.role, userId: ctx.auth.userId },
					action: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
					capabilityMap: ctx.auth.capabilityMap,
					scopeSet: ctx.auth.scopeSet,
					resource: { kind: 'organization' }
				}).allowed
			});
			return {
				laneKey: CRITICAL_TASKS_WORKSPACE_LANE_KEY,
				data,
				hydration: createCriticalTasksWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies CriticalTasksWorkspaceResult;
		}
	});

	return {
		criticalTasks: { data: settleWorkspaceDenial(deferred.data, CRITICAL_TASKS_WORKSPACE_LANE_KEY) }
	};
}
