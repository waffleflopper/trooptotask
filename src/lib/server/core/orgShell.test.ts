import { describe, it, expect } from 'vitest';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import {
	createInMemoryAppShellDeferredChromePort,
	createInMemoryAppShellFirstPaintChromePort,
	createInMemoryOrgAccessPort
} from '$lib/server/adapters/inMemoryOrgShell';
import { createReadyAppShell } from './orgShell';
import type {
	AppShellDeferredChromePort,
	AppShellFirstPaintChrome,
	AppShellFirstPaintChromePort,
	OrgAccessPort,
	MembershipInfo,
	OrgState
} from './orgShell';

const viewerCapabilityMap: MembershipInfo['capabilityMap'] = {
	calendar: 'view',
	personnel: 'view',
	training: 'view',
	criticalTasks: 'view',
	onboarding: 'none',
	ratingScheme: 'none'
};

const baseMembership: MembershipInfo = {
	orgId: 'org-1',
	membershipId: 'membership-1',
	userId: 'user-1',
	role: 'member',
	capabilityMap: viewerCapabilityMap,
	scopeSet: { kind: 'organization' }
};

const baseOrgState: OrgState = {
	orgName: 'Test Unit',
	effectiveTier: {
		tier: 'free',
		source: 'default',
		personnelCount: 0,
		personnelCap: 20,
		isReadOnly: false,
		readOnlyReason: null,
		giftExpiresAt: null,
		giftTier: null
	}
};

const baseFirstPaintChrome: AppShellFirstPaintChrome = {
	announcements: [],
	preferences: getDefaultUserOrgPreferences()
};

describe('createReadyAppShell', () => {
	it('preserves the authenticated membership user id', () => {
		const shell = createReadyAppShell({
			orgUrlSegment: 'test-unit',
			membership: baseMembership,
			orgState: baseOrgState,
			firstPaintChrome: baseFirstPaintChrome
		});

		expect(shell.user.id).toBe('user-1');
	});
});

describe('createInMemoryOrgAccessPort', () => {
	it('returns the configured membership', async () => {
		const port = createInMemoryOrgAccessPort({ membership: baseMembership, orgState: baseOrgState });

		const result = await port.getMembership();

		expect(result).toEqual(baseMembership);
	});

	it('returns the configured org state', async () => {
		const port = createInMemoryOrgAccessPort({ membership: baseMembership, orgState: baseOrgState });

		const result = await port.getOrgState();

		expect(result).toEqual(baseOrgState);
	});

	it('is callable multiple times independently', async () => {
		const port = createInMemoryOrgAccessPort({ membership: baseMembership, orgState: baseOrgState });

		const [r1, r2] = await Promise.all([port.getMembership(), port.getMembership()]);

		expect(r1).toEqual(baseMembership);
		expect(r2).toEqual(baseMembership);
	});

	it('reports orgSuspended when configured', async () => {
		const suspendedMembership: MembershipInfo = { ...baseMembership, orgSuspended: true };
		const port = createInMemoryOrgAccessPort({
			membership: suspendedMembership,
			orgState: baseOrgState
		});

		const result = await port.getMembership();

		expect(result.orgSuspended).toBe(true);
	});
});

describe('org shell port contract types', () => {
	it('in-memory adapters satisfy the App Shell port interfaces', () => {
		function acceptsOrgAccessPort(_port: OrgAccessPort) {}
		function acceptsFirstPaintChromePort(_port: AppShellFirstPaintChromePort) {}
		function acceptsDeferredChromePort(_port: AppShellDeferredChromePort) {}

		acceptsOrgAccessPort(createInMemoryOrgAccessPort({ membership: baseMembership, orgState: baseOrgState }));
		acceptsFirstPaintChromePort(
			createInMemoryAppShellFirstPaintChromePort({
				chrome: {
					announcements: [],
					preferences: getDefaultUserOrgPreferences()
				}
			})
		);
		acceptsDeferredChromePort(
			createInMemoryAppShellDeferredChromePort({
				unreadNotificationCount: 0,
				organizations: []
			})
		);

		expect(true).toBe(true);
	});
});

describe('createInMemoryAppShellFirstPaintChromePort', () => {
	const chrome: AppShellFirstPaintChrome = {
		announcements: [{ id: 'a1', title: 'Hello', message: 'World', type: 'info' as const }],
		preferences: getDefaultUserOrgPreferences()
	};

	it('returns configured announcements', async () => {
		const port = createInMemoryAppShellFirstPaintChromePort({ chrome });
		const result = await port.getFirstPaintChrome();
		expect(result.announcements).toHaveLength(1);
		expect(result.announcements[0].title).toBe('Hello');
	});
});

describe('createInMemoryAppShellDeferredChromePort', () => {
	it('returns configured notification count', async () => {
		const port = createInMemoryAppShellDeferredChromePort({
			unreadNotificationCount: 3,
			organizations: []
		});
		expect(await port.getUnreadNotificationCount()).toBe(3);
	});

	it('returns configured org list', async () => {
		const port = createInMemoryAppShellDeferredChromePort({
			unreadNotificationCount: 0,
			organizations: [{ id: 'org-1', name: 'Test Unit', role: 'owner' }]
		});
		const result = await port.getOrganizationSwitcherOrgs();
		expect(result[0]).toEqual({ id: 'org-1', name: 'Test Unit', role: 'owner' });
	});
});
