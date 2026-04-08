import type { OrgAccessPort, OrgChromePort } from './orgShell';
import type { RootOrgShellLoadResult } from './useCases/loadRootOrgShell';
import { loadRootOrgShellRouteData, projectSuspendedRootOrgShellRouteData } from './useCases/loadRootOrgShell';

export type RootOrgShellRequest =
	| { kind: 'shell'; access: OrgAccessPort; chrome: OrgChromePort }
	| { kind: 'suspended'; orgId: string; orgName: string };

export interface OrgShellCoordinator {
	loadRoot(request: RootOrgShellRequest): Promise<RootOrgShellLoadResult>;
}

export function createOrgShellCoordinator(): OrgShellCoordinator {
	return {
		loadRoot(request) {
			if (request.kind === 'suspended') {
				return Promise.resolve(projectSuspendedRootOrgShellRouteData(request.orgId, request.orgName));
			}

			return loadRootOrgShellRouteData(request.access, request.chrome);
		}
	};
}
