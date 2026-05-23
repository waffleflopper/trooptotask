import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => true)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

import { readCurrentBillingSnapshot } from './billingState';

describe('billing state use cases', () => {
	it('returns persisted Stripe billing snapshot defaults through one read interface', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'free',
				gift_tier: null,
				gift_expires_at: null
			}
		]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				id: 'snapshot-1',
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'team',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				stripe_product_id: 'prod_123',
				stripe_price_id: 'price_123',
				subscription_status: 'active',
				collection_status: 'current',
				current_period_start: '2026-05-01T00:00:00.000Z',
				current_period_end: '2026-06-01T00:00:00.000Z',
				cancel_at_period_end: false,
				canceled_at: null,
				trial_end: null,
				sync_status: 'synced',
				last_stripe_event_id: 'evt_123',
				last_stripe_event_type: 'customer.subscription.updated',
				last_stripe_event_created_at: '2026-05-01T00:01:00.000Z',
				last_processed_at: '2026-05-01T00:02:00.000Z',
				last_reconciled_at: null,
				reconciliation_result: null,
				drift_detected: false
			}
		]);

		await expect(readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore })).resolves.toEqual({
			organizationId: 'org-1',
			source: 'stripe',
			commercialPlan: 'team',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			stripeProductId: 'prod_123',
			stripePriceId: 'price_123',
			subscriptionStatus: 'active',
			collectionStatus: 'current',
			currentPeriodStart: '2026-05-01T00:00:00.000Z',
			currentPeriodEnd: '2026-06-01T00:00:00.000Z',
			cancelAtPeriodEnd: false,
			canceledAt: null,
			trialEnd: null,
			syncStatus: 'synced',
			lastStripeEventId: 'evt_123',
			lastStripeEventType: 'customer.subscription.updated',
			lastStripeEventCreatedAt: '2026-05-01T00:01:00.000Z',
			lastProcessedAt: '2026-05-01T00:02:00.000Z',
			lastReconciledAt: null,
			reconciliationResult: null,
			driftDetected: false,
			giftTier: null,
			giftExpiresAt: null
		});
	});

	it('represents active admin gifts as an explicit non-Stripe source', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'free',
				stripe_customer_id: null,
				stripe_subscription_id: null,
				subscription_status: null,
				current_period_end: null,
				gift_tier: 'unit',
				gift_expires_at: '2999-01-01T00:00:00.000Z'
			}
		]);

		const snapshot = await readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore });

		expect(snapshot).toMatchObject({
			source: 'gift',
			commercialPlan: 'unit',
			stripeSubscriptionId: null,
			syncStatus: 'not_configured',
			giftTier: 'unit',
			giftExpiresAt: '2999-01-01T00:00:00.000Z'
		});
	});

	it('keeps the higher Stripe plan when an active gift is lower than the persisted snapshot plan', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'free',
				gift_tier: 'team',
				gift_expires_at: '2999-01-01T00:00:00.000Z'
			}
		]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				id: 'snapshot-1',
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'unit',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				stripe_product_id: 'prod_123',
				stripe_price_id: 'price_123',
				subscription_status: 'active',
				collection_status: 'current',
				current_period_start: null,
				current_period_end: null,
				cancel_at_period_end: false,
				canceled_at: null,
				trial_end: null,
				sync_status: 'synced',
				last_stripe_event_id: null,
				last_stripe_event_type: null,
				last_stripe_event_created_at: null,
				last_processed_at: null,
				last_reconciled_at: null,
				reconciliation_result: null,
				drift_detected: false
			}
		]);

		const snapshot = await readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore });

		expect(snapshot).toMatchObject({
			source: 'gift',
			commercialPlan: 'unit',
			stripeSubscriptionId: 'sub_123',
			syncStatus: 'synced',
			giftTier: 'team'
		});
	});

	it('lets a higher active gift override a lower persisted Stripe snapshot plan', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'free',
				gift_tier: 'unit',
				gift_expires_at: '2999-01-01T00:00:00.000Z'
			}
		]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				id: 'snapshot-1',
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'team',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				stripe_product_id: 'prod_123',
				stripe_price_id: 'price_123',
				subscription_status: 'active',
				collection_status: 'current',
				current_period_start: null,
				current_period_end: null,
				cancel_at_period_end: false,
				canceled_at: null,
				trial_end: null,
				sync_status: 'synced',
				last_stripe_event_id: null,
				last_stripe_event_type: null,
				last_stripe_event_created_at: null,
				last_processed_at: null,
				last_reconciled_at: null,
				reconciliation_result: null,
				drift_detected: false
			}
		]);

		const snapshot = await readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore });

		expect(snapshot).toMatchObject({
			source: 'gift',
			commercialPlan: 'unit',
			stripeSubscriptionId: 'sub_123',
			syncStatus: 'synced',
			giftTier: 'unit'
		});
	});

	it('ignores expired admin gifts and returns the non-gift billing snapshot', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'team',
				stripe_customer_id: 'cus_legacy',
				stripe_subscription_id: 'sub_legacy',
				subscription_status: 'active',
				current_period_end: '2026-06-01T00:00:00.000Z',
				gift_tier: 'unit',
				gift_expires_at: '2000-01-01T00:00:00.000Z'
			}
		]);

		const snapshot = await readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore });

		expect(snapshot).toMatchObject({
			source: 'legacy_organization',
			commercialPlan: 'team',
			stripeSubscriptionId: 'sub_legacy',
			syncStatus: 'needs_reconciliation',
			giftTier: 'unit'
		});
	});

	it('maps legacy organization-row Stripe fields when no snapshot row exists yet', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'team',
				stripe_customer_id: 'cus_legacy',
				stripe_subscription_id: 'sub_legacy',
				subscription_status: 'active',
				current_period_end: '2026-06-01T00:00:00.000Z',
				gift_tier: null,
				gift_expires_at: null
			}
		]);

		await expect(readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore })).resolves.toMatchObject({
			organizationId: 'org-1',
			source: 'legacy_organization',
			commercialPlan: 'team',
			stripeCustomerId: 'cus_legacy',
			stripeSubscriptionId: 'sub_legacy',
			subscriptionStatus: 'active',
			currentPeriodEnd: '2026-06-01T00:00:00.000Z',
			syncStatus: 'needs_reconciliation'
		});
	});

	it('represents billing-disabled fallback as an explicit source', async () => {
		billingEnabledMock.mockReturnValue(false);
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});

		await expect(readCurrentBillingSnapshot({ auth: ctx.auth, store: ctx.rawStore })).resolves.toMatchObject({
			organizationId: 'org-1',
			source: 'billing_disabled',
			commercialPlan: 'unit',
			syncStatus: 'billing_disabled'
		});
	});
});
