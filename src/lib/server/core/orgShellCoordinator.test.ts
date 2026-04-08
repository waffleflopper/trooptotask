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
			kind: 'shell',
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

	it('returns the suspended root-shell payload through the coordinator boundary', async () => {
		const coordinator = createOrgShellCoordinator();

		const result = await coordinator.loadRoot({
			kind: 'suspended',
			orgId: 'org-1',
			orgName: 'Test Unit'
		});

		expect(result).toEqual({
			orgSuspended: true,
			orgId: 'org-1',
			orgName: 'Test Unit'
		});
	});

	it('preserves the deprecated demo read-only path through the coordinator boundary', async () => {
		const coordinator = createOrgShellCoordinator();

		const result = await coordinator.loadRoot({
			kind: 'shell',
			access: createInMemoryOrgAccessPort({
				membership: { ...membership, userId: null },
				orgState: { ...orgState, isDemoReadOnly: true }
			}),
			chrome: createInMemoryOrgChromePort({
				chrome: {
					...chrome,
					unreadNotificationCount: 0,
					allOrgs: []
				}
			})
		});

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: null,
			userRole: 'member',
			isDemoReadOnly: true,
			isDemoSandbox: false
		});
	});

	it('preserves the deprecated demo sandbox path through the coordinator boundary', async () => {
		const coordinator = createOrgShellCoordinator();

		const result = await coordinator.loadRoot({
			kind: 'shell',
			access: createInMemoryOrgAccessPort({
				membership: {
					...membership,
					userId: null,
					role: 'owner',
					permissions: {
						canViewCalendar: true,
						canEditCalendar: true,
						canViewPersonnel: true,
						canEditPersonnel: true,
						canViewTraining: true,
						canEditTraining: true,
						canViewOnboarding: true,
						canEditOnboarding: true,
						canViewLeadersBook: true,
						canEditLeadersBook: true,
						canManageMembers: true
					}
				},
				orgState: { ...orgState, isDemoSandbox: true }
			}),
			chrome: createInMemoryOrgChromePort({
				chrome: {
					...chrome,
					unreadNotificationCount: 0,
					allOrgs: []
				}
			})
		});

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: null,
			userRole: 'owner',
			isOwner: true,
			isDemoReadOnly: false,
			isDemoSandbox: true
		});
	});
});
