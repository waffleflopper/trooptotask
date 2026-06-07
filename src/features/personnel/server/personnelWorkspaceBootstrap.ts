import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createWorkspaceHydrationTarget,
	type DeferredData,
	type HydrationItems,
	type WorkspaceHydrationTarget
} from '$lib/server/core/streamedWorkspace';
import { fetchPersonnelBootstrap, type PersonnelBootstrap } from '$lib/server/core/useCases/personnelWorkspaceQuery';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel, StatusType } from '$lib/types';

export const PERSONNEL_WORKSPACE_LANE_KEY = 'personnel' as const;

export interface PersonnelWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export type PersonnelWorkspaceData = PersonnelBootstrap;

export type PersonnelWorkspaceHydrationMode = 'replace' | 'preserve-client';

export type PersonnelWorkspaceHydrationTarget<T> = WorkspaceHydrationTarget<T, PersonnelWorkspaceHydrationMode>;

export interface PersonnelWorkspaceHydration {
	orgId: string;
	personnel: PersonnelWorkspaceHydrationTarget<Personnel>;
	groups: PersonnelWorkspaceHydrationTarget<Group>;
	statusTypes: PersonnelWorkspaceHydrationTarget<StatusType>;
	pinnedGroups: PersonnelWorkspaceHydrationTarget<string>;
}

export interface PersonnelWorkspaceResult {
	laneKey: typeof PERSONNEL_WORKSPACE_LANE_KEY;
	data: PersonnelWorkspaceData;
	hydration: PersonnelWorkspaceHydration;
}

export interface PersonnelWorkspaceRouteData {
	[PERSONNEL_WORKSPACE_LANE_KEY]: DeferredData<PersonnelWorkspaceResult>;
}

function createPersonnelHydrationTarget<T>(items: HydrationItems<T>): PersonnelWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'random' });
}

function createPersonnelWorkspaceHydration(orgId: string, data: PersonnelWorkspaceData): PersonnelWorkspaceHydration {
	return {
		orgId,
		personnel: createPersonnelHydrationTarget(data.personnel),
		groups: createPersonnelHydrationTarget(data.groups),
		statusTypes: createPersonnelHydrationTarget(data.statusTypes),
		pinnedGroups: createPersonnelHydrationTarget(data.pinnedGroups)
	};
}

export async function streamPersonnelWorkspaceBootstrap(
	context: PersonnelWorkspaceRequestContext
): Promise<PersonnelWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const data = await fetchPersonnelBootstrap(ctx);
			return {
				laneKey: PERSONNEL_WORKSPACE_LANE_KEY,
				data,
				hydration: createPersonnelWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies PersonnelWorkspaceResult;
		}
	});

	return {
		personnel: deferred
	};
}
