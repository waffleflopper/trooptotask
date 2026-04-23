import { describe, expect, it, vi } from 'vitest';

const { readBillingOrganizationMock, canManageBillingSubscriptionMock } = vi.hoisted(() => ({
	readBillingOrganizationMock: vi.fn(),
	canManageBillingSubscriptionMock: vi.fn()
}));

vi.mock('$lib/server/core/useCases/billingOrganization', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/billingOrganization')>(
		'$lib/server/core/useCases/billingOrganization'
	);

	return {
		...actual,
		readBillingOrganization: readBillingOrganizationMock,
		canManageBillingSubscription: canManageBillingSubscriptionMock
	};
});

import { _loadBillingPageData } from './+page.server';

describe('_loadBillingPageData', () => {
	it('derives subscription management state from the app-owned billing helper', async () => {
		readBillingOrganizationMock.mockResolvedValue({
			name: 'Alpha Company',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			subscriptionStatus: 'active'
		});
		canManageBillingSubscriptionMock.mockReturnValue(true);

		const result = await _loadBillingPageData(
			{
				auth: { orgId: 'org-1' } as never,
				rawStore: { kind: 'raw-store' } as never
			},
			{
				tier: 'team',
				source: 'subscription',
				personnelCount: 20,
				personnelCap: 75,
				isReadOnly: false,
				giftExpiresAt: null,
				giftTier: null
			}
		);

		expect(readBillingOrganizationMock).toHaveBeenCalledWith({
			auth: { orgId: 'org-1' },
			store: { kind: 'raw-store' }
		});
		expect(canManageBillingSubscriptionMock).toHaveBeenCalledWith({
			name: 'Alpha Company',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			subscriptionStatus: 'active'
		});
		expect(result).toEqual(
			expect.objectContaining({
				orgName: 'Alpha Company',
				stripeCustomerId: 'cus_123',
				subscriptionStripeId: 'sub_123',
				canManageSubscription: true
			})
		);
	});
});
