import { describe, expect, it, vi } from 'vitest';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { AppShellFirstPaintChromePort, OrgAccessPort } from '$lib/server/core/orgShell';
import { createRootOrgLayoutLoad } from './createRootOrgLayoutLoad';

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

function createOrganizationQuery(row: Record<string, unknown>) {
	const query = {
		eq: vi.fn(),
		maybeSingle: vi.fn().mockResolvedValue({ data: row })
	};
	query.eq.mockReturnValue(query);

	return {
		from: vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue(query)
		})
	};
}

describe('createRootOrgLayoutLoad', () => {
	it('loads the App Shell first-paint payload without legacy top-level fields', async () => {
		const supabase = createOrganizationQuery({
			id: 'org-1',
			name: 'Test Unit',
			url_slug: '1-11-bde',
			suspended_at: null
		});
		const userSupabase = { kind: 'user-supabase' };
		const getLayoutClient = vi.fn().mockReturnValue({ supabase });
		const createSubscriptionAdapter = vi.fn().mockReturnValue({
			getEffectiveTier: vi.fn().mockResolvedValue(effectiveTier)
		});
		const createOrgAccessPort = vi.fn(
			(config: { orgId: string; userId: string; orgName: string; getEffectiveTier: () => Promise<unknown> }) =>
				({
					getMembership: vi.fn().mockResolvedValue({
						orgId: config.orgId,
						membershipId: 'membership-1',
						userId: config.userId,
						role: 'member',
						capabilityMap: {
							calendar: 'view',
							personnel: 'view',
							training: 'view',
							criticalTasks: 'view',
							onboarding: 'none',
							ratingScheme: 'none'
						},
						scopeSet: { kind: 'organization' },
						permissions: {
							canViewCalendar: true,
							canEditCalendar: false,
							canViewPersonnel: true,
							canEditPersonnel: false,
							canViewTraining: true,
							canEditTraining: false,
							canViewCriticalTasks: true,
							canEditCriticalTasks: false,
							canViewOnboarding: false,
							canEditOnboarding: false,
							canManageMembers: false
						}
					}),
					getOrgState: vi.fn().mockImplementation(async () => ({
						orgName: config.orgName,
						effectiveTier: await config.getEffectiveTier()
					}))
				}) as OrgAccessPort
		);
		const createFirstPaintChromePort = vi.fn(
			() =>
				({
					getFirstPaintChrome: vi.fn().mockResolvedValue({
						announcements: [],
						preferences: getDefaultUserOrgPreferences()
					})
				}) as AppShellFirstPaintChromePort
		);

		const load = createRootOrgLayoutLoad({
			getLayoutClient,
			createSubscriptionAdapter,
			createOrgAccessPort,
			createFirstPaintChromePort
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

		expect(result).toMatchObject({
			shell: {
				kind: 'ready',
				org: { id: 'org-1', name: 'Test Unit', urlSegment: '1-11-bde' },
				user: { id: 'user-1' },
				state: { effectiveTier, orgSuspended: false }
			}
		});
		expect(result).not.toHaveProperty('orgId');
		expect(result).not.toHaveProperty('allOrgs');
		expect(result).not.toHaveProperty('unreadNotificationCount');
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:org-preferences');
		expect(createOrgAccessPort).toHaveBeenCalledWith(
			expect.objectContaining({
				orgId: 'org-1',
				userId: 'user-1',
				userSupabase,
				orgName: 'Test Unit'
			})
		);
		expect(createFirstPaintChromePort).toHaveBeenCalledWith(
			expect.objectContaining({
				orgId: 'org-1',
				userId: 'user-1',
				userSupabase
			})
		);
	});

	it('loads the suspended App Shell path without creating ready-only ports', async () => {
		const supabase = createOrganizationQuery({
			id: 'org-1',
			name: 'Suspended Unit',
			url_slug: null,
			suspended_at: '2026-04-01T00:00:00.000Z'
		});
		const getLayoutClient = vi.fn().mockReturnValue({ supabase });
		const createSubscriptionAdapter = vi.fn();
		const createOrgAccessPort = vi.fn();
		const createFirstPaintChromePort = vi.fn();

		const load = createRootOrgLayoutLoad({
			getLayoutClient,
			createSubscriptionAdapter,
			createOrgAccessPort,
			createFirstPaintChromePort
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

		expect(result).toEqual({
			shell: {
				kind: 'suspended',
				org: { id: 'org-1', name: 'Suspended Unit', urlSegment: 'org-1' },
				state: { isReadOnly: true, orgSuspended: true }
			}
		});
		expect(createSubscriptionAdapter).not.toHaveBeenCalled();
		expect(createOrgAccessPort).not.toHaveBeenCalled();
		expect(createFirstPaintChromePort).not.toHaveBeenCalled();
	});
});
