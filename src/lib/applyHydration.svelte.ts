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

function applyTarget<T>(target: HydrationTarget | undefined, store: Loadable<T>, orgId: string): void {
	if (!target || target.mode === 'preserve-client') return;
	store.load(target.items as T[], orgId);
}

export function applyHydration(plan?: HydrationPlan, stores: HydrationStores = defaultStores): void {
	if (!plan) return;
	const { orgId } = plan;

	applyTarget(plan.personnel?.scoped, stores.personnelStore, orgId);
	// plan.personnel.all: no allPersonnelStore yet — forward-looking slot in HydrationPlan
	applyTarget(plan.groups, stores.groupsStore, orgId);
	applyTarget(plan.statusTypes, stores.statusTypesStore, orgId);
	applyTarget(plan.trainingTypes, stores.trainingTypesStore, orgId);
}
