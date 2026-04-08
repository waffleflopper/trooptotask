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
			loadRoot: vi.fn().mockResolvedValue(routePayload)
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
});
