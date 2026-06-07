import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createWorkspaceHydrationTarget,
	createWorkspaceValueHydrationTarget,
	isPromiseLike,
	type DeferredData,
	type HydrationItems,
	type WorkspaceHydrationTarget,
	type WorkspaceValueHydrationTarget
} from '$lib/server/core/streamedWorkspace';
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

export type DashboardWorkspaceHydrationTarget<T> = WorkspaceHydrationTarget<T, DashboardWorkspaceHydrationMode>;

export interface DashboardAssignmentsHydrationItems {
	types: AssignmentType[];
	assignments: DailyAssignment[];
}

export type DashboardAssignmentsWorkspaceHydrationTarget = WorkspaceValueHydrationTarget<
	DashboardAssignmentsHydrationItems,
	DashboardWorkspaceHydrationMode
>;

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

function createDashboardHydrationTarget<T>(items: HydrationItems<T>): DashboardWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'hash' });
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

	return createWorkspaceValueHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'hash' });
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
