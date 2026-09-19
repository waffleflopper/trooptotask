import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { AppShellRouteData, ReadyAppShell } from '$lib/server/core/orgShell';

export function createReadyAppShellRouteData(
	overrides: {
		orgId?: string;
		orgUrlSegment?: string;
		orgName?: string;
		userId?: string;
		role?: ReadyAppShell['member']['role'];
		criticalTasksCapability?: ReadyAppShell['member']['capabilityMap']['criticalTasks'];
	} = {}
): AppShellRouteData {
	const role = overrides.role ?? 'admin';
	const member: ReadyAppShell['member'] = {
		membershipId: 'membership-1',
		role,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: overrides.criticalTasksCapability ?? 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },
		isOwner: role === 'owner',
		isAdmin: role === 'admin'
	};

	return {
		shell: {
			kind: 'ready',
			org: {
				id: overrides.orgId ?? 'org-1',
				urlSegment: overrides.orgUrlSegment ?? overrides.orgId ?? 'org-1',
				name: overrides.orgName ?? 'Test Org'
			},
			user: { id: overrides.userId ?? 'user-1' },
			member,
			state: { orgSuspended: false },
			preferences: getDefaultUserOrgPreferences(),
			announcements: []
		}
	};
}

export function createSuspendedAppShellRouteData(
	overrides: { orgId?: string; orgUrlSegment?: string; orgName?: string } = {}
): AppShellRouteData {
	return {
		shell: {
			kind: 'suspended',
			org: {
				id: overrides.orgId ?? 'org-1',
				urlSegment: overrides.orgUrlSegment ?? overrides.orgId ?? 'org-1',
				name: overrides.orgName ?? 'Test Org'
			},
			state: { orgSuspended: true }
		}
	};
}
