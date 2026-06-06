import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { DeferredData, HydrationItems } from '$lib/server/core/streamedWorkspace';
import { fetchDashboardBootstrap, type DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, StatusType } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';

export const DASHBOARD_WORKSPACE_KEY = 'dashboard' as const;

export interface DashboardWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export type DashboardWorkspaceData = DashboardBootstrap;

export type DashboardWorkspaceHydrationMode = 'replace' | 'preserve-client';

export interface DashboardWorkspaceHydrationTarget<T> {
	mode: DashboardWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: HydrationItems<T>;
}

export interface DashboardAssignmentsWorkspaceHydrationTarget {
	mode: DashboardWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items:
		| { types: AssignmentType[]; assignments: DailyAssignment[] }
		| Promise<{
				types: AssignmentType[];
				assignments: DailyAssignment[];
		  }>;
}

export interface DashboardWorkspaceHydration {
	orgId: string;
	personnel: DashboardWorkspaceHydrationTarget<Personnel>;
	groups: DashboardWorkspaceHydrationTarget<Group>;
	statusTypes: DashboardWorkspaceHydrationTarget<StatusType>;
	availabilityEntries: DashboardWorkspaceHydrationTarget<AvailabilityEntry>;
	calendarAssignments: DashboardAssignmentsWorkspaceHydrationTarget;
	trainingTypes: DashboardWorkspaceHydrationTarget<TrainingType>;
	pinnedGroups: DashboardWorkspaceHydrationTarget<string>;
}

export interface DashboardWorkspaceResult {
	workspaceKey: typeof DASHBOARD_WORKSPACE_KEY;
	data: DashboardWorkspaceData;
	hydration: DashboardWorkspaceHydration;
}

export interface DashboardWorkspaceRouteData {
	[DASHBOARD_WORKSPACE_KEY]: DeferredData<DashboardWorkspaceResult>;
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

function hashSnapshotContent(content: string): string {
	let hash = 2166136261;
	for (let index = 0; index < content.length; index += 1) {
		hash ^= content.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
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
		const content = JSON.stringify(value) ?? String(value);
		return `resolved:${content.length}:${hashSnapshotContent(content)}`;
	} catch {
		return generateSnapshotId('resolved');
	}
}

function createDashboardHydrationTarget<T>(items: HydrationItems<T>): DashboardWorkspaceHydrationTarget<T> {
	return {
		mode: 'replace',
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
	};
}

function createDashboardAssignmentsItems(
	data: DashboardWorkspaceData
): DashboardAssignmentsWorkspaceHydrationTarget['items'] {
	if (isPromiseLike(data.todayAssignments)) {
		return data.todayAssignments.then((assignments) => ({
			types: data.assignmentTypes,
			assignments
		}));
	}

	return {
		types: data.assignmentTypes,
		assignments: data.todayAssignments
	};
}

function createDashboardAssignmentsHydrationTarget(
	data: DashboardWorkspaceData
): DashboardAssignmentsWorkspaceHydrationTarget {
	const items = createDashboardAssignmentsItems(data);

	return {
		mode: 'replace',
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
	};
}

function createDashboardWorkspaceHydration(orgId: string, data: DashboardWorkspaceData): DashboardWorkspaceHydration {
	return {
		orgId,
		personnel: createDashboardHydrationTarget(data.personnel),
		groups: createDashboardHydrationTarget(data.groups),
		statusTypes: createDashboardHydrationTarget(data.statusTypes),
		availabilityEntries: createDashboardHydrationTarget(data.availabilityEntries),
		calendarAssignments: createDashboardAssignmentsHydrationTarget(data),
		trainingTypes: createDashboardHydrationTarget(data.trainingTypes),
		pinnedGroups: createDashboardHydrationTarget(data.pinnedGroups)
	};
}

export async function streamDashboardWorkspaceBootstrap(
	context: DashboardWorkspaceRequestContext
): Promise<DashboardWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
		defer: true,
		fn: async (ctx) => {
			const data = await fetchDashboardBootstrap(ctx);
			return {
				workspaceKey: DASHBOARD_WORKSPACE_KEY,
				data,
				hydration: createDashboardWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies DashboardWorkspaceResult;
		}
	});

	return {
		dashboard: deferred
	};
}
