import { describe, expect, it, vi } from 'vitest';
import type { OrgAccessPort, OrgChromePort } from '$lib/server/core/orgShell';
import { createRootOrgLayoutLoad } from './createRootOrgLayoutLoad';

describe('createRootOrgLayoutLoad', () => {
	it('loads the authenticated root-shell path through the coordinator', async () => {
		const effectiveTier = {
			tier: 'free',
			source: 'default',
			personnelCount: 0,
			personnelCap: 20,
			isReadOnly: false,
			giftExpiresAt: null,
			giftTier: null
		} as const;
		const routePayload = {
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1',
			userRole: 'member',
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
			scopedGroupId: null,
			isOwner: false,
			isAdmin: false,
			isFullEditor: false,
			effectiveTier,
			unreadNotificationCount: 0,
			activeAnnouncements: [],
			allOrgs: [],
			isDemoReadOnly: false,
			isDemoSandbox: false,
			shell: {
				orgId: 'org-1',
				orgName: 'Test Unit',
				userId: 'user-1',
				userRole: 'member',
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
				scopedGroupId: null,
				isOwner: false,
				isAdmin: false,
				isFullEditor: false,
				effectiveTier,
				unreadNotificationCount: 0,
				activeAnnouncements: [],
				allOrgs: [],
				isDemoReadOnly: false,
				isDemoSandbox: false
			}
		};

		const query = {
			eq: vi.fn(),
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'org-1',
					name: 'Test Unit',
					demo_type: null,
					suspended_at: null
				}
			})
		};
		query.eq.mockReturnValue(query);

		const supabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue(query)
			})
		};
		const userSupabase = { kind: 'user-supabase' };
		const accessPort = { kind: 'access-port' } as unknown as OrgAccessPort;
		const chromePort = { kind: 'chrome-port' } as unknown as OrgChromePort;
		const getLayoutClient = vi.fn().mockReturnValue({ supabase });
		const createSubscriptionAdapter = vi.fn().mockReturnValue({
			getEffectiveTier: vi.fn().mockResolvedValue(effectiveTier)
		});
		const createOrgAccessPort = vi.fn().mockReturnValue(accessPort);
		const createOrgChromePort = vi.fn().mockReturnValue(chromePort);
		const coordinator = {
			loadRoot: vi.fn().mockResolvedValue(routePayload),
			loadWorkspace: vi.fn(),
			hydrate: vi.fn()
		};

		const load = createRootOrgLayoutLoad({
			coordinator,
			getLayoutClient,
			createSubscriptionAdapter,
			createOrgAccessPort,
			createOrgChromePort
		});

		const depends = vi.fn();
		const result = await load({
			params: { orgId: 'org-1' },
			locals: {
				user: { id: 'user-1' },
				supabase: userSupabase
			} as unknown as Parameters<typeof load>[0]['locals'],
			cookies: {
				get: vi.fn().mockReturnValue(undefined)
			} as unknown as Parameters<typeof load>[0]['cookies'],
			depends
		});

		expect(result).toEqual(routePayload);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:org-preferences');
		expect(coordinator.loadRoot).toHaveBeenCalledWith({
			kind: 'shell',
			access: accessPort,
			chrome: chromePort
		});
		expect(createOrgAccessPort).toHaveBeenCalledWith(
			expect.objectContaining({
				orgId: 'org-1',
				userId: 'user-1',
				userSupabase,
				orgName: 'Test Unit',
				isDemoReadOnly: false,
				isDemoSandbox: false
			})
		);
		await expect(createOrgAccessPort.mock.calls[0][0].getEffectiveTier()).resolves.toEqual(effectiveTier);
	});

	it('loads the suspended root-shell path through the coordinator', async () => {
		const suspendedPayload = {
			orgSuspended: true as const,
			orgId: 'org-1',
			orgName: 'Suspended Unit'
		};

		const query = {
			eq: vi.fn(),
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'org-1',
					name: 'Suspended Unit',
					demo_type: null,
					suspended_at: '2026-04-01T00:00:00.000Z'
				}
			})
		};
		query.eq.mockReturnValue(query);

		const supabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue(query)
			})
		};
		const getLayoutClient = vi.fn().mockReturnValue({ supabase });
		const createSubscriptionAdapter = vi.fn();
		const createOrgAccessPort = vi.fn();
		const createOrgChromePort = vi.fn();
		const coordinator = {
			loadRoot: vi.fn().mockResolvedValue(suspendedPayload),
			loadWorkspace: vi.fn(),
			hydrate: vi.fn()
		};

		const load = createRootOrgLayoutLoad({
			coordinator,
			getLayoutClient,
			createSubscriptionAdapter,
			createOrgAccessPort,
			createOrgChromePort
		});

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {} as Parameters<typeof load>[0]['locals'],
			cookies: {
				get: vi.fn().mockReturnValue(undefined)
			} as unknown as Parameters<typeof load>[0]['cookies'],
			depends: vi.fn()
		});

		expect(result).toEqual(suspendedPayload);
		expect(coordinator.loadRoot).toHaveBeenCalledWith({
			kind: 'suspended',
			orgId: 'org-1',
			orgName: 'Suspended Unit'
		});
		expect(createSubscriptionAdapter).not.toHaveBeenCalled();
		expect(createOrgAccessPort).not.toHaveBeenCalled();
		expect(createOrgChromePort).not.toHaveBeenCalled();
	});

	it('loads the deprecated demo read-only path through the coordinator with demo ports', async () => {
		const effectiveTier = {
			tier: 'free',
			source: 'default',
			personnelCount: 0,
			personnelCap: 20,
			isReadOnly: false,
			giftExpiresAt: null,
			giftTier: null
		} as const;
		const routePayload = {
			orgId: 'org-1',
			orgName: 'Showcase Unit',
			userId: null,
			userRole: 'member',
			permissions: {
				canViewCalendar: true,
				canEditCalendar: false,
				canViewPersonnel: true,
				canEditPersonnel: false,
				canViewTraining: true,
				canEditTraining: false,
				canViewOnboarding: true,
				canEditOnboarding: false,
				canViewLeadersBook: true,
				canEditLeadersBook: false,
				canManageMembers: false
			},
			scopedGroupId: null,
			isOwner: false,
			isAdmin: false,
			isFullEditor: false,
			effectiveTier,
			unreadNotificationCount: 0,
			activeAnnouncements: [],
			allOrgs: [],
			isDemoReadOnly: true,
			isDemoSandbox: false,
			shell: {
				orgId: 'org-1',
				orgName: 'Showcase Unit',
				userId: null,
				userRole: 'member',
				permissions: {
					canViewCalendar: true,
					canEditCalendar: false,
					canViewPersonnel: true,
					canEditPersonnel: false,
					canViewTraining: true,
					canEditTraining: false,
					canViewOnboarding: true,
					canEditOnboarding: false,
					canViewLeadersBook: true,
					canEditLeadersBook: false,
					canManageMembers: false
				},
				scopedGroupId: null,
				isOwner: false,
				isAdmin: false,
				isFullEditor: false,
				effectiveTier,
				unreadNotificationCount: 0,
				activeAnnouncements: [],
				allOrgs: [],
				isDemoReadOnly: true,
				isDemoSandbox: false
			}
		};

		const query = {
			eq: vi.fn(),
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'org-1',
					name: 'Showcase Unit',
					demo_type: 'showcase',
					suspended_at: null
				}
			})
		};
		query.eq.mockReturnValue(query);

		const supabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue(query)
			})
		};
		const getLayoutClient = vi.fn().mockReturnValue({ supabase });
		const createSubscriptionAdapter = vi.fn().mockReturnValue({
			getEffectiveTier: vi.fn().mockResolvedValue(effectiveTier)
		});
		const createOrgAccessPort = vi.fn();
		const createOrgChromePort = vi.fn();
		const coordinator = {
			loadRoot: vi.fn().mockResolvedValue(routePayload),
			loadWorkspace: vi.fn(),
			hydrate: vi.fn()
		};

		const load = createRootOrgLayoutLoad({
			coordinator,
			getLayoutClient,
			createSubscriptionAdapter,
			createOrgAccessPort,
			createOrgChromePort
		});

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {} as Parameters<typeof load>[0]['locals'],
			cookies: {
				get: vi.fn((name: string) => (name === 'demo_mode' ? 'readonly' : undefined))
			} as unknown as Parameters<typeof load>[0]['cookies'],
			depends: vi.fn()
		});

		expect(result).toEqual(routePayload);
		expect(coordinator.loadRoot).toHaveBeenCalledTimes(1);
		expect(coordinator.loadRoot).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'shell',
				access: expect.any(Object),
				chrome: expect.any(Object)
			})
		);

		const request = coordinator.loadRoot.mock.calls[0][0];
		const membership = await request.access.getMembership();
		const orgState = await request.access.getOrgState();
		const chrome = await request.chrome.getChromeData();

		expect(membership).toMatchObject({
			orgId: 'org-1',
			userId: null,
			role: 'member'
		});
		expect(orgState).toMatchObject({
			orgName: 'Showcase Unit',
			isDemoReadOnly: true,
			isDemoSandbox: false,
			effectiveTier
		});
		expect(chrome).toEqual({
			unreadNotificationCount: 0,
			activeAnnouncements: [],
			allOrgs: [],
			userPreferences: expect.any(Object)
		});
		expect(createOrgAccessPort).not.toHaveBeenCalled();
		expect(createOrgChromePort).not.toHaveBeenCalled();
	});

	it('loads the deprecated demo sandbox path through the coordinator with demo ports', async () => {
		const effectiveTier = {
			tier: 'free',
			source: 'default',
			personnelCount: 0,
			personnelCap: 20,
			isReadOnly: false,
			giftExpiresAt: null,
			giftTier: null
		} as const;
		const routePayload = {
			orgId: 'org-1',
			orgName: 'Sandbox Unit',
			userId: null,
			userRole: 'owner',
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
			},
			scopedGroupId: null,
			isOwner: true,
			isAdmin: false,
			isFullEditor: false,
			effectiveTier,
			unreadNotificationCount: 0,
			activeAnnouncements: [],
			allOrgs: [],
			isDemoReadOnly: false,
			isDemoSandbox: true,
			shell: {
				orgId: 'org-1',
				orgName: 'Sandbox Unit',
				userId: null,
				userRole: 'owner',
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
				},
				scopedGroupId: null,
				isOwner: true,
				isAdmin: false,
				isFullEditor: false,
				effectiveTier,
				unreadNotificationCount: 0,
				activeAnnouncements: [],
				allOrgs: [],
				isDemoReadOnly: false,
				isDemoSandbox: true
			}
		};

		const query = {
			eq: vi.fn(),
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'org-1',
					name: 'Sandbox Unit',
					demo_type: 'sandbox',
					suspended_at: null
				}
			})
		};
		query.eq.mockReturnValue(query);

		const supabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue(query)
			})
		};
		const getLayoutClient = vi.fn().mockReturnValue({ supabase });
		const createSubscriptionAdapter = vi.fn().mockReturnValue({
			getEffectiveTier: vi.fn().mockResolvedValue(effectiveTier)
		});
		const createOrgAccessPort = vi.fn();
		const createOrgChromePort = vi.fn();
		const coordinator = {
			loadRoot: vi.fn().mockResolvedValue(routePayload),
			loadWorkspace: vi.fn(),
			hydrate: vi.fn()
		};

		const load = createRootOrgLayoutLoad({
			coordinator,
			getLayoutClient,
			createSubscriptionAdapter,
			createOrgAccessPort,
			createOrgChromePort
		});

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {} as Parameters<typeof load>[0]['locals'],
			cookies: {
				get: vi.fn((name: string) =>
					name === 'demo_sandbox' ? JSON.stringify({ orgId: 'org-1', role: 'owner' }) : undefined
				)
			} as unknown as Parameters<typeof load>[0]['cookies'],
			depends: vi.fn()
		});

		expect(result).toEqual(routePayload);
		expect(coordinator.loadRoot).toHaveBeenCalledTimes(1);
		expect(coordinator.loadRoot).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'shell',
				access: expect.any(Object),
				chrome: expect.any(Object)
			})
		);

		const request = coordinator.loadRoot.mock.calls[0][0];
		const membership = await request.access.getMembership();
		const orgState = await request.access.getOrgState();

		expect(membership).toMatchObject({
			orgId: 'org-1',
			userId: null,
			role: 'owner'
		});
		expect(membership.permissions).toMatchObject({
			canEditCalendar: true,
			canEditPersonnel: true,
			canEditTraining: true,
			canEditOnboarding: true,
			canEditLeadersBook: true,
			canManageMembers: true
		});
		expect(orgState).toMatchObject({
			orgName: 'Sandbox Unit',
			isDemoReadOnly: false,
			isDemoSandbox: true,
			effectiveTier
		});
		expect(createOrgAccessPort).not.toHaveBeenCalled();
		expect(createOrgChromePort).not.toHaveBeenCalled();
	});
});
