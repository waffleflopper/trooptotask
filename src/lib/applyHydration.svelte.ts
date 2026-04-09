import type { HydrationPlan } from '$lib/server/core/orgShell';
import { orgShellHydrationCoordinator, type HydrationStores } from './orgShellHydrationCoordinator.svelte';

export type { HydrationStores } from './orgShellHydrationCoordinator.svelte';

export function resetHydrationState(): void {
	orgShellHydrationCoordinator.reset();
}

export async function applyHydration(plan?: HydrationPlan, stores?: HydrationStores): Promise<void> {
	return orgShellHydrationCoordinator.hydrate(plan, stores);
}
