import type { OrgAccessPort, OrgChromePort, OrgShellData } from '../orgShell';

export async function loadOrgShell(access: OrgAccessPort, chrome: OrgChromePort): Promise<OrgShellData> {
	const [membership, orgState, chromeData] = await Promise.all([
		access.getMembership(),
		access.getOrgState(),
		chrome.getChromeData()
	]);

	const isOwner = membership.role === 'owner';
	const isAdmin = membership.role === 'admin';
	const isPrivileged = isOwner || isAdmin;

	return {
		orgId: membership.orgId,
		orgName: orgState.orgName,
		userId: membership.userId,
		userPreferences: chromeData.userPreferences,
		userRole: membership.role,
		capabilityMap: membership.capabilityMap,
		scopeSet: membership.scopeSet,
		permissions: membership.permissions,
		scopedGroupId: membership.scopedGroupId,
		isOwner,
		isAdmin,
		isFullEditor:
			!isPrivileged &&
			membership.scopeSet.kind === 'organization' &&
			Object.values(membership.capabilityMap).every((level) => level === 'configure'),
		effectiveTier: orgState.effectiveTier,
		unreadNotificationCount: chromeData.unreadNotificationCount,
		activeAnnouncements: chromeData.activeAnnouncements,
		allOrgs: chromeData.allOrgs,
		isDemoReadOnly: orgState.isDemoReadOnly,
		isDemoSandbox: orgState.isDemoSandbox,
		orgSuspended: membership.orgSuspended
	};
}
