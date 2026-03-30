/**
 * Client-side hydration applier for the org shell/workspace split (RFC #415).
 *
 * `applyHydration(plan?, stores?)` replaces per-layout `lastRefs` / promise-ref guards.
 * The server packages a `HydrationPlan` inside each `WorkspaceBootstrap` and workspace
 * layouts call `applyHydration(data.<workspace>.hydration)` in a `$effect`.
 *
 * Modes:
 *   replace        → store.load(items, orgId)   — new server state, mutation log replayed
 *   merge          → store.load(items, orgId)   — same as replace (mutation log preserved)
 *   preserve-client → no-op                     — keeps current client/optimistic state
 *
 * The optional `stores` parameter is the injection point for tests; production callers
 * rely on the default binding to the real module-level singletons.
 */
import type { Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType } from '$features/training/training.types';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import type { HydrationPlan, HydrationTarget } from '$lib/server/core/orgShell';

// Structural type — only the load method is needed; avoids coupling to full Store<T>.
interface Loadable<T> {
	load(items: T[], orgId: string): void;
}

export interface HydrationStores {
	personnelStore: Loadable<Personnel>;
	groupsStore: Loadable<Group>;
	statusTypesStore: Loadable<StatusType>;
	trainingTypesStore: Loadable<TrainingType>;
}

const defaultStores: HydrationStores = {
	personnelStore,
	groupsStore,
	statusTypesStore,
	trainingTypesStore
};

const appliedSnapshotKeys = new Map<string, string>();
const pendingSnapshotKeys = new Map<string, string>();

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function getTargetCacheKey(orgId: string, targetName: string): string {
	return `${orgId}:${targetName}`;
}

async function applyTarget<T>(
	target: HydrationTarget | undefined,
	store: Loadable<T>,
	orgId: string,
	targetName: string
): Promise<void> {
	if (!target || target.mode === 'preserve-client') return;

	const cacheKey = getTargetCacheKey(orgId, targetName);
	if (appliedSnapshotKeys.get(cacheKey) === target.snapshotKey) return;
	if (pendingSnapshotKeys.get(cacheKey) === target.snapshotKey) return;

	pendingSnapshotKeys.set(cacheKey, target.snapshotKey);

	if (isPromiseLike<T[]>(target.items)) {
		const items = await target.items;
		if (pendingSnapshotKeys.get(cacheKey) !== target.snapshotKey) return;
		store.load(items, orgId);
		pendingSnapshotKeys.delete(cacheKey);
		appliedSnapshotKeys.set(cacheKey, target.snapshotKey);
		return;
	}

	store.load(target.items as T[], orgId);
	appliedSnapshotKeys.set(cacheKey, target.snapshotKey);
}

export function resetHydrationState(): void {
	appliedSnapshotKeys.clear();
	pendingSnapshotKeys.clear();
}

export async function applyHydration(plan?: HydrationPlan, stores: HydrationStores = defaultStores): Promise<void> {
	if (!plan) return;
	const { orgId } = plan;

	await Promise.all([
		applyTarget(plan.personnel?.scoped, stores.personnelStore, orgId, 'personnel.scoped'),
		// plan.personnel.all: no allPersonnelStore yet — forward-looking slot in HydrationPlan
		applyTarget(plan.groups, stores.groupsStore, orgId, 'groups'),
		applyTarget(plan.statusTypes, stores.statusTypesStore, orgId, 'statusTypes'),
		applyTarget(plan.trainingTypes, stores.trainingTypesStore, orgId, 'trainingTypes')
	]);
}
