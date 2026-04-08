import type { OrgAccessPort, OrgChromePort, OrgShellData } from '../orgShell';
import { loadOrgShell } from './loadOrgShell';

export type RootOrgShellRouteData = OrgShellData & {
	shell: OrgShellData;
};

export interface SuspendedRootOrgShellRouteData {
	orgSuspended: true;
	orgId: string;
	orgName: string;
}

export type RootOrgShellLoadResult = RootOrgShellRouteData | SuspendedRootOrgShellRouteData;

export async function loadRootOrgShellRouteData(
	access: OrgAccessPort,
	chrome: OrgChromePort
): Promise<RootOrgShellRouteData> {
	return projectRootOrgShellRouteData(await loadOrgShell(access, chrome));
}

export function projectSuspendedRootOrgShellRouteData(orgId: string, orgName: string): SuspendedRootOrgShellRouteData {
	return {
		orgSuspended: true,
		orgId,
		orgName
	};
}

export function projectRootOrgShellRouteData(shell: OrgShellData): RootOrgShellRouteData {
	return {
		...shell,
		shell
	};
}
