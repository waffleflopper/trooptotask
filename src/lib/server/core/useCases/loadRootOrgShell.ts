import type { OrgAccessPort, OrgChromePort, OrgShellData } from '../orgShell';
import { loadOrgShell } from './loadOrgShell';

export type RootOrgShellRouteData = OrgShellData & {
	shell: OrgShellData;
};

export async function loadRootOrgShellRouteData(
	access: OrgAccessPort,
	chrome: OrgChromePort
): Promise<RootOrgShellRouteData> {
	return projectRootOrgShellRouteData(await loadOrgShell(access, chrome));
}

export function projectRootOrgShellRouteData(shell: OrgShellData): RootOrgShellRouteData {
	return {
		...shell,
		shell
	};
}
