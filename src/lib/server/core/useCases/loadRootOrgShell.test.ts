import { describe, expect, it } from 'vitest';
import { createInMemoryOrgAccessPort, createInMemoryOrgChromePort } from '$lib/server/adapters/inMemoryOrgShell';
import type { ChromeData, MembershipInfo, OrgState } from '../orgShell';
import { loadRootOrgShellRouteData } from './loadRootOrgShell';

const baseMembership: MembershipInfo = {
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

const baseOrgState: OrgState = {
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

const baseChrome: ChromeData = {
	unreadNotificationCount: 3,
	activeAnnouncements: [{ id: 'a1', title: 'Heads up', message: 'Check this', type: 'info' }],
	allOrgs: [{ id: 'org-1', name: 'Test Unit', role: 'member' }]
};

describe('loadRootOrgShellRouteData', () => {
	it('returns the canonical root org shell route payload for a member', async () => {
		const result = await loadRootOrgShellRouteData(
			createInMemoryOrgAccessPort({ membership: baseMembership, orgState: baseOrgState }),
			createInMemoryOrgChromePort({ chrome: baseChrome })
		);

		expect(result.orgId).toBe('org-1');
		expect(result.orgName).toBe('Test Unit');
		expect(result.userRole).toBe('member');
		expect(result.userId).toBe('user-1');
		expect(result.permissions).toEqual(baseMembership.permissions);
		expect(result.scopedGroupId).toBeNull();
		expect(result.isOwner).toBe(false);
		expect(result.isAdmin).toBe(false);
		expect(result.isFullEditor).toBe(false);
		expect(result.unreadNotificationCount).toBe(3);
		expect(result.activeAnnouncements).toEqual(baseChrome.activeAnnouncements);
		expect(result.allOrgs).toEqual(baseChrome.allOrgs);
		expect(result.effectiveTier).toEqual(baseOrgState.effectiveTier);
		expect(result.isDemoReadOnly).toBe(false);
		expect(result.isDemoSandbox).toBe(false);
		expect(result.shell).toEqual({
			orgId: result.orgId,
			orgName: result.orgName,
			userId: result.userId,
			userRole: result.userRole,
			permissions: result.permissions,
			scopedGroupId: result.scopedGroupId,
			isOwner: result.isOwner,
			isAdmin: result.isAdmin,
			isFullEditor: result.isFullEditor,
			effectiveTier: result.effectiveTier,
			unreadNotificationCount: result.unreadNotificationCount,
			activeAnnouncements: result.activeAnnouncements,
			allOrgs: result.allOrgs,
			isDemoReadOnly: result.isDemoReadOnly,
			isDemoSandbox: result.isDemoSandbox
		});
	});

	it('preserves privileged admin semantics', async () => {
		const result = await loadRootOrgShellRouteData(
			createInMemoryOrgAccessPort({
				membership: { ...baseMembership, role: 'admin', scopedGroupId: null },
				orgState: baseOrgState
			}),
			createInMemoryOrgChromePort({ chrome: baseChrome })
		);

		expect(result.userRole).toBe('admin');
		expect(result.isAdmin).toBe(true);
		expect(result.isOwner).toBe(false);
		expect(result.isFullEditor).toBe(false);
		expect(result.scopedGroupId).toBeNull();
		expect(result.shell.isAdmin).toBe(true);
	});

	it('preserves scoped-member semantics at the shell boundary', async () => {
		const result = await loadRootOrgShellRouteData(
			createInMemoryOrgAccessPort({
				membership: { ...baseMembership, scopedGroupId: 'group-1' },
				orgState: baseOrgState
			}),
			createInMemoryOrgChromePort({ chrome: baseChrome })
		);

		expect(result.userRole).toBe('member');
		expect(result.scopedGroupId).toBe('group-1');
		expect(result.isFullEditor).toBe(false);
		expect(result.shell.scopedGroupId).toBe('group-1');
	});

	it('preserves full-editor member semantics at the shell boundary', async () => {
		const result = await loadRootOrgShellRouteData(
			createInMemoryOrgAccessPort({
				membership: {
					...baseMembership,
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
				orgState: baseOrgState
			}),
			createInMemoryOrgChromePort({ chrome: baseChrome })
		);

		expect(result.userRole).toBe('member');
		expect(result.isOwner).toBe(false);
		expect(result.isAdmin).toBe(false);
		expect(result.isFullEditor).toBe(true);
		expect(result.shell.isFullEditor).toBe(true);
	});

	it('keeps the deprecated demo read-only path wired through the shell boundary', async () => {
		const result = await loadRootOrgShellRouteData(
			createInMemoryOrgAccessPort({
				membership: { ...baseMembership, userId: null },
				orgState: { ...baseOrgState, isDemoReadOnly: true }
			}),
			createInMemoryOrgChromePort({ chrome: { ...baseChrome, unreadNotificationCount: 0, allOrgs: [] } })
		);

		expect(result.userId).toBeNull();
		expect(result.userRole).toBe('member');
		expect(result.isDemoReadOnly).toBe(true);
		expect(result.isDemoSandbox).toBe(false);
		expect(result.shell.isDemoReadOnly).toBe(true);
	});

	it('keeps the deprecated demo sandbox path wired through the shell boundary until removal', async () => {
		const result = await loadRootOrgShellRouteData(
			createInMemoryOrgAccessPort({
				membership: {
					...baseMembership,
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
				orgState: { ...baseOrgState, isDemoSandbox: true }
			}),
			createInMemoryOrgChromePort({ chrome: { ...baseChrome, unreadNotificationCount: 0, allOrgs: [] } })
		);

		expect(result.userId).toBeNull();
		expect(result.userRole).toBe('owner');
		expect(result.isOwner).toBe(true);
		expect(result.isAdmin).toBe(false);
		expect(result.isFullEditor).toBe(false);
		expect(result.isDemoReadOnly).toBe(false);
		expect(result.isDemoSandbox).toBe(true);
		expect(result.shell.isDemoSandbox).toBe(true);
	});
});
