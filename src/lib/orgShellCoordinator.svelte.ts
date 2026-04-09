import { createOrgShellHydrationCoordinator } from '$lib/orgShellHydrationCoordinator.svelte';
import type { OrgShellHydrator } from '$lib/orgShellCoordinator';

export type OrgShellCoordinator = OrgShellHydrator;

export function createOrgShellCoordinator(): OrgShellCoordinator {
	return createOrgShellHydrationCoordinator();
}

export const orgShellCoordinator = createOrgShellCoordinator();
