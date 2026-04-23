import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { applyBillingCancellation, persistBillingCustomerId, readBillingOrganization } from './billingOrganization';

describe('billingOrganization use cases', () => {
	it('reads the current billing organization summary through the app-owned store', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				name: 'Alpha Company',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'active'
			}
		]);

		await expect(readBillingOrganization({ auth: ctx.auth, store: ctx.rawStore })).resolves.toEqual({
			name: 'Alpha Company',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			subscriptionStatus: 'active'
		});
	});

	it('persists a newly created Stripe customer id on the organization row', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				name: 'Alpha Company',
				stripe_customer_id: null,
				stripe_subscription_id: null,
				subscription_status: null,
				tier: 'free'
			}
		]);

		await persistBillingCustomerId({ auth: ctx.auth, store: ctx.rawStore }, { customerId: 'cus_new' });

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(saved).toMatchObject({
			stripe_customer_id: 'cus_new',
			tier: 'free'
		});
	});

	it('applies the cancellation reset without route-local provider writes', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				name: 'Alpha Company',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'active',
				tier: 'team'
			}
		]);

		await applyBillingCancellation(
			{ auth: ctx.auth, store: ctx.rawStore },
			{
				orgUpdates: {
					tier: 'free',
					subscription_status: null,
					stripe_subscription_id: null
				}
			}
		);

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(saved).toMatchObject({
			tier: 'free',
			stripe_customer_id: 'cus_123',
			stripe_subscription_id: null,
			subscription_status: null
		});
	});
});
