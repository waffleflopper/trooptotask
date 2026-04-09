import type {
	HydrationPlan,
	HydrationPlannerPort,
	OrgAccessPort,
	OrgChromePort,
	OrgWorkspacePort,
	WorkspaceBootstrap,
	WorkspaceKey
} from './orgShell';
import type { RootOrgShellLoadResult } from './useCases/loadRootOrgShell';
import { createOrgShellHydrationCoordinator, type HydrationStores } from '$lib/orgShellHydrationCoordinator.svelte';
import { loadRootOrgShellRouteData, projectSuspendedRootOrgShellRouteData } from './useCases/loadRootOrgShell';

export type RootOrgShellRequest =
	| { kind: 'shell'; access: OrgAccessPort; chrome: OrgChromePort }
	| { kind: 'suspended'; orgId: string; orgName: string };

/**
 * Orchestration boundary for org shell/workspace bootstrap data and client hydration.
 */
export interface OrgShellCoordinator {
	loadRoot(request: RootOrgShellRequest): Promise<RootOrgShellLoadResult>;
	loadWorkspace<T, K extends WorkspaceKey>(
		workspace: K,
		ports: {
			workspace: OrgWorkspacePort;
			planner: HydrationPlannerPort;
		}
	): Promise<Record<K, WorkspaceBootstrap<T>>>;
	hydrate(plan?: HydrationPlan, stores?: HydrationStores): Promise<void>;
}

export function createOrgShellCoordinator(): OrgShellCoordinator {
	const hydrationCoordinator = createOrgShellHydrationCoordinator();

	return {
		loadRoot(request) {
			if (request.kind === 'suspended') {
				return Promise.resolve(projectSuspendedRootOrgShellRouteData(request.orgId, request.orgName));
			}

			return loadRootOrgShellRouteData(request.access, request.chrome);
		},

		async loadWorkspace<T, K extends WorkspaceKey>(
			workspace: K,
			ports: {
				workspace: OrgWorkspacePort;
				planner: HydrationPlannerPort;
			}
		): Promise<Record<K, WorkspaceBootstrap<T>>> {
			const data = await ports.workspace.getWorkspaceData<T>(workspace);
			const hydration = ports.planner.createPlan(workspace, data);
			const bootstrap: WorkspaceBootstrap<T> = hydration ? { workspace, data, hydration } : { workspace, data };
			const result = {} as Record<K, WorkspaceBootstrap<T>>;
			result[workspace] = bootstrap;
			return result;
		},

		hydrate(plan, stores) {
			return hydrationCoordinator.hydrate(plan, stores);
		}
	};
}
