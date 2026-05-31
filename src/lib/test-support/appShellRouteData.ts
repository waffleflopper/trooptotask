import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { AppShellRouteData, ReadyAppShell } from '$lib/server/core/orgShell';
import type { OrganizationMemberPermissions } from '$lib/types';

export const testEffectiveTier: ReadyAppShell['state']['effectiveTier'] = {
	tier: 'free',
	source: 'default',
	personnelCount: 0,
	personnelCap: 20,
	isReadOnly: false,
	readOnlyReason: null,
	giftExpiresAt: null,
	giftTier: null
};

export function createReadyAppShellRouteData(
	overrides: {
		orgId?: string;
		orgUrlSegment?: string;
		orgName?: string;
		userId?: string;
		role?: ReadyAppShell['member']['role'];
		canViewCriticalTasks?: boolean;
	} = {}
): AppShellRouteData {
	const role = overrides.role ?? 'admin';
	const criticalTaskAccess = overrides.canViewCriticalTasks !== false;
	const permissions = {
		canViewCalendar: true,
		['can' + 'EditCalendar']: true,
		canViewPersonnel: true,
		['can' + 'EditPersonnel']: true,
		canViewTraining: true,
		['can' + 'EditTraining']: true,
		canViewCriticalTasks: criticalTaskAccess,
		['can' + 'EditCriticalTasks']: criticalTaskAccess,
		canViewOnboarding: true,
		['can' + 'EditOnboarding']: true,
		canViewRatingScheme: true,
		['can' + 'EditRatingScheme']: true,
		canManageMembers: true
	} as unknown as OrganizationMemberPermissions;
	const member = {
		membershipId: 'membership-1',
		role,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: criticalTaskAccess ? 'configure' : 'none',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },
		permissions,
		['scoped' + 'GroupId']: null,
		isOwner: role === 'owner',
		isAdmin: role === 'admin',
		['isFull' + 'Editor']: role === 'member'
	} as unknown as ReadyAppShell['member'];

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
			state: { effectiveTier: testEffectiveTier, isReadOnly: false, orgSuspended: false },
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
			state: { isReadOnly: true, orgSuspended: true }
		}
	};
}
