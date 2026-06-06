import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { DeferredData, HydrationItems } from '$lib/server/core/orgShell';
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

export interface PersonnelWorkspaceHydrationTarget<T> {
	mode: PersonnelWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: HydrationItems<T>;
}

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

	return generateSnapshotId('resolved');
}

function createPersonnelHydrationTarget<T>(items: HydrationItems<T>): PersonnelWorkspaceHydrationTarget<T> {
	return {
		mode: 'replace',
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
	};
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
