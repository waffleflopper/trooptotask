import { describe, expect, it } from 'vitest';
import { createInMemoryOrgAccessPort, createInMemoryOrgChromePort } from '$lib/server/adapters/inMemoryOrgShell';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { ChromeData, MembershipInfo, OrgState } from './orgShell';
import { createOrgShellCoordinator } from './orgShellCoordinator';

const membership: MembershipInfo = {
	orgId: 'org-1',
	userId: 'user-1',
	role: 'member',
	permissions: {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canViewOnboarding: false,
		canEditOnboarding: false,
		canViewLeadersBook: false,
		canEditLeadersBook: false,
		canManageMembers: false
	},
	scopedGroupId: null
};

const orgState: OrgState = {
	orgName: 'Test Unit',
	isDemoReadOnly: false,
	isDemoSandbox: false,
	effectiveTier: {
		tier: 'free',
		source: 'default',
		personnelCount: 0,
		personnelCap: 20,
		isReadOnly: false,
		giftExpiresAt: null,
		giftTier: null
	}
};

const chrome: ChromeData = {
	unreadNotificationCount: 3,
	activeAnnouncements: [{ id: 'a1', title: 'Heads up', message: 'Check this', type: 'info' }],
	allOrgs: [{ id: 'org-1', name: 'Test Unit', role: 'member' }],
	userPreferences: getDefaultUserOrgPreferences()
};

describe('OrgShellCoordinator', () => {
	it('loads the canonical root org shell payload for the authenticated happy path', async () => {
		const coordinator = createOrgShellCoordinator();

		const result = await coordinator.loadRoot({
			access: createInMemoryOrgAccessPort({ membership, orgState }),
			chrome: createInMemoryOrgChromePort({ chrome })
		});

		expect(result).toEqual({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1',
			userPreferences: chrome.userPreferences,
			userRole: 'member',
			permissions: membership.permissions,
			scopedGroupId: null,
			isOwner: false,
			isAdmin: false,
			isFullEditor: false,
			effectiveTier: orgState.effectiveTier,
			unreadNotificationCount: 3,
			activeAnnouncements: chrome.activeAnnouncements,
			allOrgs: chrome.allOrgs,
			isDemoReadOnly: false,
			isDemoSandbox: false,
			orgSuspended: undefined,
			shell: {
				orgId: 'org-1',
				orgName: 'Test Unit',
				userId: 'user-1',
				userPreferences: chrome.userPreferences,
				userRole: 'member',
				permissions: membership.permissions,
				scopedGroupId: null,
				isOwner: false,
				isAdmin: false,
				isFullEditor: false,
				effectiveTier: orgState.effectiveTier,
				unreadNotificationCount: 3,
				activeAnnouncements: chrome.activeAnnouncements,
				allOrgs: chrome.allOrgs,
				isDemoReadOnly: false,
				isDemoSandbox: false,
				orgSuspended: undefined
			}
		});
	});
});
