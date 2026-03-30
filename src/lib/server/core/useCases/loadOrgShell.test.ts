import { describe, it, expect } from 'vitest';
import { createInMemoryOrgAccessPort, createInMemoryOrgChromePort } from '$lib/server/adapters/inMemoryOrgShell';
import type { MembershipInfo, OrgState, ChromeData } from '../orgShell';
import { loadOrgShell } from './loadOrgShell';

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
	unreadNotificationCount: 2,
	activeAnnouncements: [{ id: 'a1', title: 'Heads up', message: 'Something changed', type: 'info' }],
	allOrgs: [{ id: 'org-1', name: 'Test Unit', role: 'member' }]
};

function buildPorts(
	membership: MembershipInfo = baseMembership,
	orgState: OrgState = baseOrgState,
	chrome: ChromeData = baseChrome
) {
	return {
		access: createInMemoryOrgAccessPort({ membership, orgState }),
		chrome: createInMemoryOrgChromePort({ chrome })
	};
}

describe('loadOrgShell', () => {
	it('assembles OrgShellData from all three port responses', async () => {
		const { access, chrome } = buildPorts();

		const result = await loadOrgShell(access, chrome);

		expect(result.orgId).toBe('org-1');
		expect(result.orgName).toBe('Test Unit');
		expect(result.userId).toBe('user-1');
		expect(result.userRole).toBe('member');
		expect(result.permissions).toEqual(baseMembership.permissions);
		expect(result.scopedGroupId).toBeNull();
		expect(result.effectiveTier.tier).toBe('free');
		expect(result.unreadNotificationCount).toBe(2);
		expect(result.activeAnnouncements).toHaveLength(1);
		expect(result.activeAnnouncements[0].title).toBe('Heads up');
		expect(result.allOrgs).toHaveLength(1);
		expect(result.isDemoReadOnly).toBe(false);
		expect(result.isDemoSandbox).toBe(false);
	});

	it('sets isOwner=true and isFullEditor=false for owner role', async () => {
		const { access, chrome } = buildPorts({ ...baseMembership, role: 'owner' });

		const result = await loadOrgShell(access, chrome);

		expect(result.isOwner).toBe(true);
		expect(result.isAdmin).toBe(false);
		expect(result.isFullEditor).toBe(false);
	});

	it('sets isAdmin=true and isOwner=false for admin role', async () => {
		const { access, chrome } = buildPorts({ ...baseMembership, role: 'admin' });

		const result = await loadOrgShell(access, chrome);

		expect(result.isAdmin).toBe(true);
		expect(result.isOwner).toBe(false);
		expect(result.isFullEditor).toBe(false);
	});

	it('sets isFullEditor=true when not privileged, no scoped group, and full-editor permissions', async () => {
		const fullEditorPermissions: MembershipInfo['permissions'] = {
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
		};
		const { access, chrome } = buildPorts({
			...baseMembership,
			role: 'member',
			permissions: fullEditorPermissions,
			scopedGroupId: null
		});

		const result = await loadOrgShell(access, chrome);

		expect(result.isFullEditor).toBe(true);
		expect(result.isOwner).toBe(false);
		expect(result.isAdmin).toBe(false);
	});

	it('passes orgSuspended through when set', async () => {
		const { access, chrome } = buildPorts({ ...baseMembership, orgSuspended: true });

		const result = await loadOrgShell(access, chrome);

		expect(result.orgSuspended).toBe(true);
	});

	it('passes demo flags through from OrgState', async () => {
		const { access, chrome } = buildPorts(baseMembership, {
			...baseOrgState,
			isDemoReadOnly: true,
			isDemoSandbox: false
		});

		const result = await loadOrgShell(access, chrome);

		expect(result.isDemoReadOnly).toBe(true);
		expect(result.isDemoSandbox).toBe(false);
	});
});
