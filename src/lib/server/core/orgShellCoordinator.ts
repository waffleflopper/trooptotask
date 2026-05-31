import type {
	DeferredData,
	HydrationPlan,
	HydrationPlannerPort,
	OrgWorkspacePort,
	StreamableOrgWorkspacePort,
	WorkspaceBootstrap,
	WorkspaceKey
} from './orgShell';
import type { HydrationStores, OrgShellHydrator } from '$lib/orgShellCoordinator';

export interface OrgShellCoordinatorDeps {
	hydrationCoordinator?: Pick<OrgShellHydrator, 'hydrate'>;
}

/**
 * Orchestration boundary for org shell/workspace bootstrap data and client hydration.
 */
export interface OrgShellCoordinator {
	loadWorkspace<T, K extends WorkspaceKey>(
		workspace: K,
		ports: {
			workspace: OrgWorkspacePort;
			planner: HydrationPlannerPort;
		}
	): Promise<Record<K, WorkspaceBootstrap<T>>>;
	streamWorkspace<T, K extends WorkspaceKey>(
		workspace: K,
		ports: {
			workspace: StreamableOrgWorkspacePort;
			planner: HydrationPlannerPort;
		}
	): Promise<Record<K, DeferredData<WorkspaceBootstrap<T>>>>;
	hydrate(plan?: HydrationPlan, stores?: HydrationStores): Promise<void>;
}

export function createOrgShellCoordinator(deps: OrgShellCoordinatorDeps = {}): OrgShellCoordinator {
	return {
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

		async streamWorkspace<T, K extends WorkspaceKey>(
			workspace: K,
			ports: {
				workspace: StreamableOrgWorkspacePort;
				planner: HydrationPlannerPort;
			}
		): Promise<Record<K, DeferredData<WorkspaceBootstrap<T>>>> {
			const deferred = await ports.workspace.streamWorkspaceData<T>(workspace);
			const bootstrap = deferred.data.then((data) => {
				const hydration = ports.planner.createPlan(workspace, data);
				return hydration ? { workspace, data, hydration } : { workspace, data };
			});
			const result = {} as Record<K, DeferredData<WorkspaceBootstrap<T>>>;
			result[workspace] = { data: bootstrap };
			return result;
		},

		hydrate(plan, stores) {
			if (!deps.hydrationCoordinator) {
				throw new Error('OrgShellCoordinator hydrate() requires an injected hydration coordinator');
			}

			return deps.hydrationCoordinator.hydrate(plan, stores);
		}
	};
}
