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
			readOnlyReason: null,
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
				canManageMembers: false
			},
			isOwner: false,
			isAdmin: false,
			effectiveTier,
			unreadNotificationCount: 0,
			activeAnnouncements: [],
			allOrgs: [],
			orgUrlSegment: '1-11-bde',
			shell: {
				orgId: 'org-1',
				orgUrlSegment: '1-11-bde',
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
					canManageMembers: false
				},
				isOwner: false,
				isAdmin: false,
				effectiveTier,
				unreadNotificationCount: 0,
				activeAnnouncements: [],
				allOrgs: []
			}
		};

		const query = {
			eq: vi.fn(),
			maybeSingle: vi.fn().mockResolvedValue({
				data: {
					id: 'org-1',
					name: 'Test Unit',
					url_slug: '1-11-bde',
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
			streamWorkspace: vi.fn(),
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
			params: { orgId: '1-11-bde' },
			locals: {
				user: { id: 'user-1' },
				supabase: userSupabase
			} as unknown as Parameters<typeof load>[0]['locals'],
			cookies: {
				get: vi.fn().mockReturnValue(undefined)
			} as unknown as Parameters<typeof load>[0]['cookies'],
			depends,
			url: new URL('http://localhost/org/1-11-bde/calendar')
		});

		expect(result).toEqual(routePayload);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:org-preferences');
		expect(coordinator.loadRoot).toHaveBeenCalledWith(
			expect.objectContaining({
				resolveRequest: expect.any(Function)
			})
		);

		const request = await coordinator.loadRoot.mock.calls[0][0].resolveRequest();
		expect(request).toEqual({
			kind: 'shell',
			orgUrlSegment: '1-11-bde',
			access: accessPort,
			chrome: chromePort
		});
		expect(createOrgAccessPort).toHaveBeenCalledWith(
			expect.objectContaining({
				orgId: 'org-1',
				userId: 'user-1',
				userSupabase,
				orgName: 'Test Unit'
			})
		);
		await expect(createOrgAccessPort.mock.calls[0][0].getEffectiveTier()).resolves.toEqual(effectiveTier);
	});

	it('loads the suspended root-shell path through the coordinator', async () => {
		const suspendedPayload = {
			orgSuspended: true as const,
			orgId: 'org-1',
			orgName: 'Suspended Unit',
			orgUrlSegment: 'org-1'
		};

		const query = {
			eq: vi.fn(),
			maybeSingle: vi.fn().mockResolvedValue({
				data: {
					id: 'org-1',
					name: 'Suspended Unit',
					url_slug: null,
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
			streamWorkspace: vi.fn(),
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
			depends: vi.fn(),
			url: new URL('http://localhost/org/org-1')
		});

		expect(result).toEqual(suspendedPayload);
		expect(coordinator.loadRoot).toHaveBeenCalledWith(
			expect.objectContaining({
				resolveRequest: expect.any(Function)
			})
		);

		const request = await coordinator.loadRoot.mock.calls[0][0].resolveRequest();
		expect(request).toEqual({
			kind: 'suspended',
			orgId: 'org-1',
			orgName: 'Suspended Unit',
			orgUrlSegment: 'org-1'
		});
		expect(createSubscriptionAdapter).not.toHaveBeenCalled();
		expect(createOrgAccessPort).not.toHaveBeenCalled();
		expect(createOrgChromePort).not.toHaveBeenCalled();
	});
});
