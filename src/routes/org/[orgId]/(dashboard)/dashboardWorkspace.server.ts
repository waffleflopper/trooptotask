import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createWorkspaceHydrationTarget,
	createWorkspaceValueHydrationTarget,
	isPromiseLike,
	type DeferredData,
	type HydrationItems
} from '$lib/server/core/streamedWorkspace';
import { fetchDashboardBootstrap } from '$features/dashboard/index.server';

import {
	DASHBOARD_WORKSPACE_KEY,
	type DashboardWorkspaceData,
	type DashboardWorkspaceResult,
	type DashboardWorkspaceHydration,
	type DashboardWorkspaceHydrationTarget,
	type DashboardAssignmentsWorkspaceHydrationTarget
} from '$features/dashboard/contracts';
export interface DashboardWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
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
