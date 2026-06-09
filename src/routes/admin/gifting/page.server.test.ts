import { beforeEach, describe, expect, it, vi } from 'vitest';

const { platformGiftingMock, platformMetricsMock } = vi.hoisted(() => ({
	platformGiftingMock: {
		listOrganizations: vi.fn(),
		getOrganizationGiftState: vi.fn(),
		grantGift: vi.fn(),
		revokeGift: vi.fn(),
		extendGift: vi.fn()
	},
	platformMetricsMock: {
		countActivePersonnelByOrganization: vi.fn(),
		getOwnerMembershipsByOrganization: vi.fn()
	}
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event),
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformGifting', () => ({
	createSupabasePlatformGifting: () => platformGiftingMock
}));

vi.mock('$lib/server/adapters/supabasePlatformMetrics', () => ({
	createSupabasePlatformMetrics: () => platformMetricsMock,
	displayOwnerMembership: (owner: { email?: string | null } | undefined) => owner?.email ?? '(unknown)'
}));

import { actions, load } from './+page.server';

function makeRequest(form: Record<string, string>): Request {
	return new Request('http://localhost/admin/gifting', {
		method: 'POST',
		body: new URLSearchParams(form)
	});
}

function makeContext() {
	return {
		adminClient: {
			from: vi.fn((table: string) => {
				if (table === 'organizations') throw new Error('route must use PlatformGifting');
				throw new Error(`Unexpected table ${table}`);
			})
		},
		adminUser: { id: 'admin-1', role: 'super_admin' },
		audit: vi.fn()
	};
}

const giftOrganizations = [
	{
		id: 'org-a',
		name: 'Able Company',
		tier: 'free',
		giftTier: null,
		giftExpiresAt: null,
		giftedBy: null,
		stripeSubscriptionId: null,
		subscriptionStatus: null,
		stripeCustomerId: null
	},
	{
		id: 'org-b',
		name: 'Bravo Company',
		tier: 'team',
		giftTier: 'unit',
		giftExpiresAt: '2026-07-01T00:00:00.000Z',
		giftedBy: 'admin-1',
		stripeSubscriptionId: 'sub_123',
		subscriptionStatus: 'active',
		stripeCustomerId: 'cus_123'
	}
] as const;

describe('admin gifting route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		platformGiftingMock.listOrganizations.mockResolvedValue(giftOrganizations);
		platformGiftingMock.grantGift.mockResolvedValue({ status: 'updated', action: 'gift', orgId: 'org-a' });
		platformGiftingMock.revokeGift.mockResolvedValue({ status: 'updated', action: 'revoke', orgId: 'org-a' });
		platformGiftingMock.extendGift.mockResolvedValue({ status: 'updated', action: 'extend', orgId: 'org-a' });
		platformMetricsMock.countActivePersonnelByOrganization.mockResolvedValue(
			new Map([
				['org-a', 7],
				['org-b', 11]
			])
		);
		platformMetricsMock.getOwnerMembershipsByOrganization.mockResolvedValue(
			new Map([
				[
					'org-a',
					{
						kind: 'single',
						membership: { organizationId: 'org-a', userId: 'owner-a', email: 'owner-a@example.com' }
					}
				],
				[
					'org-b',
					{
						kind: 'single',
						membership: { organizationId: 'org-b', userId: 'owner-b', email: 'owner-b@example.com' }
					}
				]
			])
		);
	});

	it('loads giftable organizations through PlatformGifting and preserves the page shape', async () => {
		const result = await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/gifting?search=bravo')
		} as unknown as Parameters<typeof load>[0]);

		expect(platformGiftingMock.listOrganizations).toHaveBeenCalledOnce();
		expect(platformMetricsMock.countActivePersonnelByOrganization).toHaveBeenCalledWith(['org-a', 'org-b']);
		expect(result).toEqual({
			search: 'bravo',
			organizations: [
				{
					id: 'org-b',
					name: 'Bravo Company',
					ownerEmail: 'owner-b@example.com',
					tier: 'team',
					giftTier: 'unit',
					giftExpiresAt: '2026-07-01T00:00:00.000Z',
					giftedBy: 'admin-1',
					personnelCount: 11,
					hasActiveSubscription: true,
					subscriptionStatus: 'active',
					stripeSubscriptionId: 'sub_123'
				}
			]
		});
	});

	it('delegates grant, revoke, and extend actions through PlatformGifting', async () => {
		await expect(
			actions.giftTier({
				__ctx: makeContext(),
				request: makeRequest({ orgId: 'org-a', giftTier: 'unit', days: '45' })
			} as unknown as Parameters<(typeof actions)['giftTier']>[0])
		).resolves.toEqual({ success: true, action: 'gift' });
		expect(platformGiftingMock.grantGift).toHaveBeenCalledWith({ orgId: 'org-a', giftTier: 'unit', days: 45 });

		await expect(
			actions.revokeGift({
				__ctx: makeContext(),
				request: makeRequest({ orgId: 'org-a' })
			} as unknown as Parameters<(typeof actions)['revokeGift']>[0])
		).resolves.toEqual({ success: true, action: 'revoke' });
		expect(platformGiftingMock.revokeGift).toHaveBeenCalledWith('org-a');

		await expect(
			actions.extendGift({
				__ctx: makeContext(),
				request: makeRequest({ orgId: 'org-a', days: '10' })
			} as unknown as Parameters<(typeof actions)['extendGift']>[0])
		).resolves.toEqual({ success: true, action: 'extend' });
		expect(platformGiftingMock.extendGift).toHaveBeenCalledWith({ orgId: 'org-a', days: 10 });
	});

	it('preserves action error shapes from PlatformGifting outcomes', async () => {
		platformGiftingMock.grantGift.mockResolvedValueOnce({ status: 'not_found' });
		await expect(
			actions.giftTier({
				__ctx: makeContext(),
				request: makeRequest({ orgId: 'missing-org', giftTier: 'unit', days: '45' })
			} as unknown as Parameters<(typeof actions)['giftTier']>[0])
		).resolves.toEqual({ status: 404, data: { error: 'Organization not found' } });

		platformGiftingMock.revokeGift.mockResolvedValueOnce({ status: 'not_found' });
		await expect(
			actions.revokeGift({
				__ctx: makeContext(),
				request: makeRequest({ orgId: 'missing-org' })
			} as unknown as Parameters<(typeof actions)['revokeGift']>[0])
		).resolves.toEqual({ status: 404, data: { error: 'Organization not found' } });

		platformGiftingMock.extendGift.mockResolvedValueOnce({ status: 'no_active_gift' });
		await expect(
			actions.extendGift({
				__ctx: makeContext(),
				request: makeRequest({ orgId: 'org-a', days: '10' })
			} as unknown as Parameters<(typeof actions)['extendGift']>[0])
		).resolves.toEqual({ status: 400, data: { error: 'Organization does not have an active gift' } });
	});
});
