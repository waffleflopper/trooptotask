import { describe, it, expect } from 'vitest';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import {
	createInMemoryOrgAccessPort,
	createInMemoryOrgChromePort,
	createInMemoryOrgWorkspacePort,
	createInMemoryHydrationPlannerPort
} from '$lib/server/adapters/inMemoryOrgShell';
import type {
	OrgAccessPort,
	OrgChromePort,
	OrgWorkspacePort,
	HydrationPlannerPort,
	MembershipInfo,
	OrgState,
	ChromeData,
	WorkspaceBootstrap,
	HydrationPlan
} from './orgShell';

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
		function acceptsOrgChromePort(_port: OrgChromePort) {}
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
		acceptsOrgChromePort(
			createInMemoryOrgChromePort({
				chrome: {
					unreadNotificationCount: 0,
					activeAnnouncements: [],
					allOrgs: [],
					userPreferences: getDefaultUserOrgPreferences()
				}
			})
		);
		acceptsOrgWorkspacePort(createInMemoryOrgWorkspacePort(workspaceData));
		acceptsHydrationPlannerPort(createInMemoryHydrationPlannerPort(hydrationPlans));

		expect(true).toBe(true);
	});
});

describe('createInMemoryOrgChromePort', () => {
	const chrome: ChromeData = {
		unreadNotificationCount: 3,
		activeAnnouncements: [{ id: 'a1', title: 'Hello', message: 'World', type: 'info' as const }],
		allOrgs: [{ id: 'org-1', name: 'Test Unit', role: 'owner' }],
		userPreferences: getDefaultUserOrgPreferences()
	};

	it('returns configured notification count', async () => {
		const port = createInMemoryOrgChromePort({ chrome });
		const result = await port.getChromeData();
		expect(result.unreadNotificationCount).toBe(3);
	});

	it('returns configured announcements', async () => {
		const port = createInMemoryOrgChromePort({ chrome });
		const result = await port.getChromeData();
		expect(result.activeAnnouncements).toHaveLength(1);
		expect(result.activeAnnouncements[0].title).toBe('Hello');
	});

	it('returns configured org list', async () => {
		const port = createInMemoryOrgChromePort({ chrome });
		const result = await port.getChromeData();
		expect(result.allOrgs[0]).toEqual({ id: 'org-1', name: 'Test Unit', role: 'owner' });
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
