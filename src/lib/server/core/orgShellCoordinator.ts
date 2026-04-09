import type {
	HydrationPlannerPort,
	OrgAccessPort,
	OrgChromePort,
	OrgWorkspacePort,
	WorkspaceBootstrap,
	WorkspaceKey
} from './orgShell';
import type { RootOrgShellLoadResult } from './useCases/loadRootOrgShell';
import { loadRootOrgShellRouteData, projectSuspendedRootOrgShellRouteData } from './useCases/loadRootOrgShell';

export type RootOrgShellRequest =
	| { kind: 'shell'; access: OrgAccessPort; chrome: OrgChromePort }
	| { kind: 'suspended'; orgId: string; orgName: string };

/**
 * Server-side orchestration boundary for org shell/workspace bootstrap data.
 * Applying the emitted `HydrationPlan` remains a client concern via
 * `src/lib/applyHydration.svelte.ts` from each workspace `+layout.svelte`.
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
}

export function createOrgShellCoordinator(): OrgShellCoordinator {
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
		}
	};
}
