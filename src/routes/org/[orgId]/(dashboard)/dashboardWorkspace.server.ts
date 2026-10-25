import { fetchDashboardBootstrap } from '$features/dashboard/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestDashboardWorkspaceContext } from '$lib/server/adapters/requestContexts.server';
import {
	createCompositeWorkspaceSnapshotKey,
	createWorkspaceHydrationTarget,
	createWorkspaceValueHydrationTarget,
	isPromiseLike,
	type DeferredData,
	type HydrationItems
} from '$lib/server/adapters/streamedWorkspace';
import type { Cookies } from '@sveltejs/kit';
import { readConfirmedChangeCookies, type ConfirmedChangesByTab } from '$lib/stores/core';

import {
	DASHBOARD_WORKSPACE_KEY,
	type DashboardAssignmentsWorkspaceHydrationTarget,
	type DashboardRangeHydrationTarget,
	type DashboardWorkspaceData,
	type DashboardWorkspaceHydration,
	type DashboardWorkspaceHydrationTarget,
	type DashboardWorkspaceResult
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

function createDashboardRangeHydrationTarget<T>(
	items: HydrationItems<T>,
	range: DashboardWorkspaceData['range']
): DashboardRangeHydrationTarget<T> {
	return {
		...createWorkspaceHydrationTarget(items, { mode: 'range', resolvedSnapshotKey: 'hash' }),
		snapshotKey: createCompositeWorkspaceSnapshotKey({ items, range }, { resolved: 'hash' }),
		range
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
		...createWorkspaceValueHydrationTarget(items, { mode: 'range', resolvedSnapshotKey: 'hash' }),
		range: data.range
	};
}

function createDashboardWorkspaceHydration(
	orgId: string,
	data: DashboardWorkspaceData,
	confirmedChangesByTab: ConfirmedChangesByTab
): DashboardWorkspaceHydration {
	return {
		orgId,
		confirmedChangesByTab,
		personnel: createDashboardHydrationTarget(data.personnel),
		groups: createDashboardHydrationTarget(data.groups),
		statusTypes: createDashboardHydrationTarget(data.statusTypes),
		availabilityEntries: createDashboardRangeHydrationTarget(data.availabilityEntries, data.range),
		calendarAssignments: createDashboardAssignmentsHydrationTarget(data),
		trainingTypes: createDashboardHydrationTarget(data.trainingTypes),
		pinnedGroups: createDashboardHydrationTarget(data.pinnedGroups)
	};
}

async function createDashboardWorkspaceBootstrap(
	context: DashboardWorkspaceRequestContext
): Promise<DashboardWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: createRequestDashboardWorkspaceContext,
		policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
		defer: true,
		fn: async (ctx) => {
			const data = await fetchDashboardBootstrap(ctx);
			return {
				workspaceKey: DASHBOARD_WORKSPACE_KEY,
				data,
				hydration: createDashboardWorkspaceHydration(
					ctx.auth.orgId,
					data,
					readConfirmedChangeCookies(context.cookies.getAll())
				)
			} satisfies DashboardWorkspaceResult;
		}
	});

	return {
		dashboard: deferred
	};
}

const requestWorkspaces = new WeakMap<App.Locals, Map<string, Promise<DashboardWorkspaceRouteData>>>();

export function streamDashboardWorkspaceBootstrap(
	context: DashboardWorkspaceRequestContext
): Promise<DashboardWorkspaceRouteData> {
	let workspaces = requestWorkspaces.get(context.locals);
	if (!workspaces) {
		workspaces = new Map();
		requestWorkspaces.set(context.locals, workspaces);
	}
	let workspace = workspaces.get(context.orgId);
	if (!workspace) {
		workspace = createDashboardWorkspaceBootstrap(context);
		workspaces.set(context.orgId, workspace);
	}
	return workspace;
}
