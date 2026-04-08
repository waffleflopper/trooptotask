import type { OrgAccessPort, OrgChromePort } from './orgShell';
import type { RootOrgShellRouteData } from './useCases/loadRootOrgShell';
import { loadRootOrgShellRouteData } from './useCases/loadRootOrgShell';

export interface OrgShellCoordinator {
	loadRoot(ports: { access: OrgAccessPort; chrome: OrgChromePort }): Promise<RootOrgShellRouteData>;
}

export function createOrgShellCoordinator(): OrgShellCoordinator {
	return {
		loadRoot({ access, chrome }) {
			return loadRootOrgShellRouteData(access, chrome);
		}
	};
}
