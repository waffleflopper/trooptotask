import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';

const { readBillingOrganizationMock, canManageBillingSubscriptionMock, readCurrentBillingSnapshotMock } = vi.hoisted(
	() => ({
		readBillingOrganizationMock: vi.fn(),
		canManageBillingSubscriptionMock: vi.fn(),
		readCurrentBillingSnapshotMock: vi.fn()
	})
);

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

vi.mock('$lib/server/core/useCases/billingState', () => ({
	readCurrentBillingSnapshot: readCurrentBillingSnapshotMock
}));

import { _loadBillingPageData } from './+page.server';

describe('_loadBillingPageData', () => {
	beforeEach(() => {
		readBillingOrganizationMock.mockReset();
		canManageBillingSubscriptionMock.mockReset();
		readCurrentBillingSnapshotMock.mockReset();
	});

	it('denies non-owner billing access before reading billing organization details', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin'
			}
		});

		await expect(
			_loadBillingPageData(ctx, {
				tier: 'team',
				source: 'subscription',
				personnelCount: 20,
				personnelCap: 75,
				isReadOnly: false,
				giftExpiresAt: null,
				giftTier: null
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(readBillingOrganizationMock).not.toHaveBeenCalled();
		expect(readCurrentBillingSnapshotMock).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.accessBilling',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('derives subscription management state from the app-owned billing helper', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'owner'
			}
		});
		readBillingOrganizationMock.mockResolvedValue({
			name: 'Alpha Company',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			subscriptionStatus: 'active'
		});
		readCurrentBillingSnapshotMock.mockResolvedValue({
			organizationId: 'org-1',
			source: 'stripe',
			commercialPlan: 'team'
		});
		canManageBillingSubscriptionMock.mockReturnValue(true);

		const result = await _loadBillingPageData(
			{
				auth: ctx.auth,
				audit: ctx.audit,
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
			auth: expect.objectContaining({ orgId: 'org-1', role: 'owner' }),
			store: { kind: 'raw-store' }
		});
		expect(canManageBillingSubscriptionMock).toHaveBeenCalledWith({
			name: 'Alpha Company',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			subscriptionStatus: 'active'
		});
		expect(readCurrentBillingSnapshotMock).toHaveBeenCalledWith({
			auth: expect.objectContaining({ orgId: 'org-1', role: 'owner' }),
			store: { kind: 'raw-store' }
		});
		expect(result).toEqual(
			expect.objectContaining({
				orgName: 'Alpha Company',
				stripeCustomerId: 'cus_123',
				subscriptionStripeId: 'sub_123',
				billingSnapshot: {
					organizationId: 'org-1',
					source: 'stripe',
					commercialPlan: 'team'
				},
				canManageSubscription: true
			})
		);
	});
});
