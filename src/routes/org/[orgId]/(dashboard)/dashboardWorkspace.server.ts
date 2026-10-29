import {
	fetchDashboardBootstrap,
	loadGroupStrengthOutline,
	readDashboardRoster
} from '$features/dashboard/index.server';
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
	type DashboardWorkspaceResult,
	type GroupStrengthOutline
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

interface DashboardRequestWorkspace {
	route: DashboardWorkspaceRouteData;
	/** Settles with the roster reads, before the rest of the workspace; null when unknown. */
	groupStrengthOutline: Promise<GroupStrengthOutline | null>;
}

async function createDashboardWorkspaceBootstrap(
	context: DashboardWorkspaceRequestContext
): Promise<DashboardRequestWorkspace> {
	let settleOutline!: (outline: Promise<GroupStrengthOutline | null>) => void;
	const groupStrengthOutline = new Promise<GroupStrengthOutline | null>((resolve) => (settleOutline = resolve));
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: createRequestDashboardWorkspaceContext,
		policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
		defer: true,
		fn: async (ctx) => {
			const roster = readDashboardRoster(ctx);
			settleOutline(loadGroupStrengthOutline(roster).catch(() => null));
			const data = await fetchDashboardBootstrap(ctx, roster);
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

	// The workspace's own load error reports a failure; the outline only falls back to the compact skeleton.
	deferred.data.catch(() => settleOutline(Promise.resolve(null)));

	return { route: { dashboard: deferred }, groupStrengthOutline };
}

const requestWorkspaces = new WeakMap<App.Locals, Map<string, Promise<DashboardRequestWorkspace>>>();

export async function streamDashboardWorkspaceBootstrap(
	context: DashboardWorkspaceRequestContext
): Promise<DashboardWorkspaceRouteData> {
	return (await requestWorkspace(context)).route;
}

/** The Dashboard's by-group outline from the same roster reads as its workspace. */
export async function loadDashboardGroupStrengthOutline(
	context: DashboardWorkspaceRequestContext
): Promise<GroupStrengthOutline | null> {
	return (await requestWorkspace(context)).groupStrengthOutline;
}

function requestWorkspace(context: DashboardWorkspaceRequestContext): Promise<DashboardRequestWorkspace> {
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
