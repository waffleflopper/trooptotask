import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { DeferredData, HydrationItems } from '$lib/server/core/orgShell';
import { fetchCriticalTasksBootstrap } from '$lib/server/core/useCases/criticalTasksWorkspaceQuery';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { CriticalTasksSettings, IctTask, PersonnelIctCompletion } from '../criticalTasks.types';

export const CRITICAL_TASKS_WORKSPACE_LANE_KEY = 'critical-tasks' as const;

export interface CriticalTasksWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface CriticalTasksWorkspaceData {
	settings: CriticalTasksSettings;
	personnel: HydrationItems<Personnel>;
	groups: HydrationItems<Group>;
	ictTasks: HydrationItems<IctTask>;
	personnelIctCompletions: HydrationItems<PersonnelIctCompletion>;
}

export type CriticalTasksWorkspaceHydrationMode = 'replace' | 'preserve-client';

export interface CriticalTasksWorkspaceHydrationTarget<T> {
	mode: CriticalTasksWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: HydrationItems<T>;
}

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

const deferredSnapshotKeys = new WeakMap<object, string>();
let fallbackSnapshotCounter = 0;

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function generateSnapshotId(prefix: string): string {
	const randomId = globalThis.crypto?.randomUUID?.();
	if (randomId) {
		return `${prefix}:${randomId}`;
	}

	fallbackSnapshotCounter = (fallbackSnapshotCounter + 1) % 1_000_000;
	return `${prefix}:fallback:${fallbackSnapshotCounter}`;
}

function createSnapshotKey(value: unknown): string {
	if (isPromiseLike(value)) {
		let key = deferredSnapshotKeys.get(value);
		if (!key) {
			key = generateSnapshotId('deferred');
			deferredSnapshotKeys.set(value, key);
		}
		return key;
	}

	try {
		return `resolved:${JSON.stringify(value)}`;
	} catch {
		return generateSnapshotId('resolved:fallback');
	}
}

function createCriticalTasksHydrationTarget<T>(items: HydrationItems<T>): CriticalTasksWorkspaceHydrationTarget<T> {
	return {
		mode: 'replace',
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
	};
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
			const data = await fetchCriticalTasksBootstrap(ctx);
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
