import { describe, expect, it } from 'vitest';
import type { BillingSnapshot } from '$lib/types/subscription';
import { visibleBillingSnapshotForAdminRole } from './adminBillingVisibility';

function snapshot(): BillingSnapshot {
	return {
		organizationId: 'org-1',
		source: 'stripe',
		commercialPlan: 'team',
		stripeCustomerId: 'cus_secret',
		stripeSubscriptionId: 'sub_secret',
		stripeProductId: 'prod_secret',
		stripePriceId: 'price_secret',
		subscriptionStatus: 'active',
		collectionStatus: 'current',
		currentPeriodStart: '2026-05-01T00:00:00.000Z',
		currentPeriodEnd: '2026-06-01T00:00:00.000Z',
		cancelAtPeriodEnd: false,
		canceledAt: null,
		trialEnd: null,
		syncStatus: 'synced',
		lastStripeEventId: 'evt_secret',
		lastStripeEventType: 'customer.subscription.updated',
		lastStripeEventCreatedAt: '2026-05-01T00:01:00.000Z',
		lastProcessedAt: '2026-05-01T00:02:00.000Z',
		lastReconciledAt: '2026-05-24T00:00:00.000Z',
		reconciliationResult: 'matched',
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null
	};
}

describe('admin billing visibility', () => {
	it('strips provider identifiers from support-visible billing snapshot data', () => {
		const visible = visibleBillingSnapshotForAdminRole('support', snapshot());

		expect(visible).toMatchObject({
			source: 'stripe',
			commercialPlan: 'team',
			subscriptionStatus: 'active',
			collectionStatus: 'current',
			syncStatus: 'synced',
			lastReconciledAt: '2026-05-24T00:00:00.000Z',
			reconciliationResult: 'matched',
			stripeCustomerId: null,
			stripeSubscriptionId: null,
			stripeProductId: null,
			stripePriceId: null,
			lastStripeEventId: null,
			lastStripeEventType: null,
			lastStripeEventCreatedAt: null,
			lastProcessedAt: null
		});
		expect(JSON.stringify(visible)).not.toContain('cus_secret');
		expect(JSON.stringify(visible)).not.toContain('sub_secret');
		expect(JSON.stringify(visible)).not.toContain('price_secret');
		expect(JSON.stringify(visible)).not.toContain('evt_secret');
	});

	it('keeps provider identifiers available to billing admins', () => {
		const visible = visibleBillingSnapshotForAdminRole('billing', snapshot());

		expect(visible?.stripeCustomerId).toBe('cus_secret');
		expect(visible?.stripeSubscriptionId).toBe('sub_secret');
		expect(visible?.stripePriceId).toBe('price_secret');
		expect(visible?.lastStripeEventId).toBe('evt_secret');
	});
});
