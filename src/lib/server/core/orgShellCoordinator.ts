import type {
	HydrationPlan,
	HydrationPlannerPort,
	OrgAccessPort,
	OrgChromePort,
	OrgShellData,
	OrgWorkspacePort,
	WorkspaceBootstrap,
	WorkspaceKey
} from './orgShell';
import type { HydrationStores, OrgShellHydrator } from '$lib/orgShellCoordinator';
import { loadOrgShell } from './useCases/loadOrgShell';

export type RootOrgShellRouteData = OrgShellData & {
	shell: OrgShellData;
};

export interface SuspendedRootOrgShellRouteData {
	orgSuspended: true;
	orgId: string;
	orgName: string;
}

export type RootOrgShellLoadResult = RootOrgShellRouteData | SuspendedRootOrgShellRouteData;

export type RootOrgShellRequest =
	| { kind: 'shell'; access: OrgAccessPort; chrome: OrgChromePort }
	| { kind: 'suspended'; orgId: string; orgName: string };

export interface RootOrgLoadPort {
	resolveRequest(): Promise<RootOrgShellRequest>;
}

export interface OrgShellCoordinatorDeps {
	hydrationCoordinator?: Pick<OrgShellHydrator, 'hydrate'>;
}

function isRootOrgLoadPort(request: RootOrgShellRequest | RootOrgLoadPort): request is RootOrgLoadPort {
	return 'resolveRequest' in request;
}

/**
 * Orchestration boundary for org shell/workspace bootstrap data and client hydration.
 */
export interface OrgShellCoordinator {
	loadRoot(request: RootOrgShellRequest | RootOrgLoadPort): Promise<RootOrgShellLoadResult>;
	loadWorkspace<T, K extends WorkspaceKey>(
		workspace: K,
		ports: {
			workspace: OrgWorkspacePort;
			planner: HydrationPlannerPort;
		}
	): Promise<Record<K, WorkspaceBootstrap<T>>>;
	hydrate(plan?: HydrationPlan, stores?: HydrationStores): Promise<void>;
}

export function createOrgShellCoordinator(deps: OrgShellCoordinatorDeps = {}): OrgShellCoordinator {
	return {
		async loadRoot(input) {
			const request = isRootOrgLoadPort(input) ? await input.resolveRequest() : input;

			if (request.kind === 'suspended') {
				return {
					orgSuspended: true,
					orgId: request.orgId,
					orgName: request.orgName
				};
			}

			return loadOrgShell(request.access, request.chrome).then((shell) => ({
				...shell,
				shell
			}));
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
			if (!deps.hydrationCoordinator) {
				throw new Error('OrgShellCoordinator hydrate() requires an injected hydration coordinator');
			}

			return deps.hydrationCoordinator.hydrate(plan, stores);
		}
	};
}
