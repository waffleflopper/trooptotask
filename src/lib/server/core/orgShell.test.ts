import { describe, it, expect } from 'vitest';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import {
	createInMemoryAppShellDeferredChromePort,
	createInMemoryAppShellFirstPaintChromePort,
	createInMemoryOrgAccessPort,
	createInMemoryOrgWorkspacePort,
	createInMemoryHydrationPlannerPort
} from '$lib/server/adapters/inMemoryOrgShell';
import { createReadyAppShell } from './orgShell';
import type {
	AppShellDeferredChromePort,
	AppShellFirstPaintChrome,
	AppShellFirstPaintChromePort,
	OrgAccessPort,
	OrgWorkspacePort,
	HydrationPlannerPort,
	MembershipInfo,
	OrgState,
	WorkspaceBootstrap,
	HydrationPlan
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

	it('rejects ready shell creation without an authenticated user id', () => {
		expect(() =>
			createReadyAppShell({
				orgUrlSegment: 'test-unit',
				membership: { ...baseMembership, userId: null },
				orgState: baseOrgState,
				firstPaintChrome: baseFirstPaintChrome
			})
		).toThrow('Ready app shell requires an authenticated user id');
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

describe('WorkspaceBootstrap contract', () => {
	it('wraps workspace-specific data with the workspace key', () => {
		const bootstrap: WorkspaceBootstrap<{ events: string[] }> = {
			workspace: 'calendar',
			data: { events: [] }
		};

		expect(bootstrap.workspace).toBe('calendar');
		expect(bootstrap.data.events).toEqual([]);
		expect(bootstrap.hydration).toBeUndefined();
	});

	it('carries a hydration plan when provided', () => {
		const plan: HydrationPlan = {
			orgId: 'test-org',
			groups: {
				mode: 'preserve-client',
				snapshotKey: 'groups:1',
				items: [{ id: 'g1', name: 'Alpha', sortOrder: 0 }]
			}
		};
		const bootstrap: WorkspaceBootstrap<null> = {
			workspace: 'personnel',
			data: null,
			hydration: plan
		};

		expect(bootstrap.hydration?.groups?.mode).toBe('preserve-client');
		const groupItems = bootstrap.hydration?.groups?.items as Array<{ name: string }>;
		expect(groupItems).toHaveLength(1);
		expect(groupItems[0].name).toBe('Alpha');
	});
});

describe('org shell port contract types', () => {
	it('in-memory adapters satisfy the four shell/workspace port interfaces', () => {
		function acceptsOrgAccessPort(_port: OrgAccessPort) {}
		function acceptsFirstPaintChromePort(_port: AppShellFirstPaintChromePort) {}
		function acceptsDeferredChromePort(_port: AppShellDeferredChromePort) {}
		function acceptsOrgWorkspacePort(_port: OrgWorkspacePort) {}
		function acceptsHydrationPlannerPort(_port: HydrationPlannerPort) {}

		const workspaceData = new Map([['calendar', { events: [] }]] as const);
		const hydrationPlans = new Map([
			[
				'calendar',
				{
					orgId: 'test-org',
					groups: {
						mode: 'merge',
						snapshotKey: 'groups:calendar',
						items: []
					}
				} satisfies HydrationPlan
			]
		] as const);

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
		acceptsOrgWorkspacePort(createInMemoryOrgWorkspacePort(workspaceData));
		acceptsHydrationPlannerPort(createInMemoryHydrationPlannerPort(hydrationPlans));

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

describe('createInMemoryOrgWorkspacePort', () => {
	it('returns data for a seeded workspace key', async () => {
		const data = new Map([['calendar', { events: ['e1', 'e2'] }]] as const);
		const port = createInMemoryOrgWorkspacePort(data);

		const result = await port.getWorkspaceData<{ events: string[] }>('calendar');

		expect(result.events).toEqual(['e1', 'e2']);
	});

	it('rejects for an unseeded workspace key', async () => {
		const port = createInMemoryOrgWorkspacePort(new Map());

		await expect(port.getWorkspaceData('personnel')).rejects.toThrow('personnel');
	});
});

describe('createInMemoryHydrationPlannerPort', () => {
	it('returns the plan for a seeded workspace', () => {
		const plan: HydrationPlan = {
			orgId: 'test-org',
			groups: {
				mode: 'preserve-client',
				snapshotKey: 'groups:personnel',
				items: [{ id: 'g1', name: 'Alpha', sortOrder: 0 }]
			},
			statusTypes: {
				mode: 'replace',
				snapshotKey: 'status:personnel',
				items: []
			}
		};
		const port = createInMemoryHydrationPlannerPort(new Map([['personnel', plan]]));

		const result = port.createPlan('personnel', {});

		expect(result?.groups?.mode).toBe('preserve-client');
		expect(result?.groups?.items).toHaveLength(1);
		expect(result?.statusTypes).toEqual({
			mode: 'replace',
			snapshotKey: 'status:personnel',
			items: []
		});
	});

	it('returns undefined for an unseeded workspace', () => {
		const port = createInMemoryHydrationPlannerPort(new Map());

		expect(port.createPlan('dashboard', {})).toBeUndefined();
	});
});
