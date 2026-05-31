import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { AppShellRouteData, ReadyAppShell } from '$lib/server/core/orgShell';

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
	const permissions: ReadyAppShell['member']['permissions'] = {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewCriticalTasks: criticalTaskAccess,
		canEditCriticalTasks: criticalTaskAccess,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewRatingScheme: true,
		canEditRatingScheme: true,
		canManageMembers: true
	};
	const member: ReadyAppShell['member'] = {
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
		scopedGroupId: null,
		isOwner: role === 'owner',
		isAdmin: role === 'admin',
		isFullEditor: role === 'member'
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
