import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	applyBillingCancellation,
	cancelBillingSubscriptionForOrganization,
	cancelBillingSubscriptionForOrganizationWithTransition,
	persistBillingCustomerId,
	readBillingOrganization
} from './billingOrganization';

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
			subscriptionStatus: 'active',
			currentPeriodEnd: null
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
					stripe_subscription_id: null,
					current_period_end: null
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
			subscription_status: null,
			current_period_end: null
		});
	});

	it('denies stale-session cancellation before provider cancellation or local subscription reset', async () => {
		const ctx = createTestContext({
			sensitiveActionDecision: {
				allowed: false,
				reason: 'denied.staleSession',
				sessionAgeMs: 3_600_000,
				requiresStepUp: true
			}
		});
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

		await expect(
			cancelBillingSubscriptionForOrganization(ctx, { confirmedImmediateCancellation: true })
		).rejects.toMatchObject({ status: 403 });

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});
		expect(ctx.billingPort.calls).toEqual([]);
		expect(saved).toMatchObject({
			tier: 'team',
			stripe_subscription_id: 'sub_123',
			subscription_status: 'active'
		});
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'billing.cancel_authorization_denied',
				resourceType: 'organization',
				resourceId: 'test-org',
				details: {
					sensitiveAction: expect.objectContaining({
						action: 'billing.cancel',
						reason: 'denied.staleSession'
					})
				},
				severity: 'warning'
			}
		]);
	});

	it('rejects immediate cancellation when the local subscription status is not cancellable', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				name: 'Alpha Company',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'trialing',
				tier: 'team'
			}
		]);

		await expect(
			cancelBillingSubscriptionForOrganization(ctx, { confirmedImmediateCancellation: true })
		).rejects.toMatchObject({ status: 400 });

		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('applies the immediate cancellation transition after provider cancellation succeeds', async () => {
		const ctx = createTestContext();
		const billingCancellationTransition = {
			applyImmediateCancellation: vi.fn(async () => {})
		};
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

		await expect(
			cancelBillingSubscriptionForOrganizationWithTransition(
				{ ...ctx, billingCancellationTransition },
				{ confirmedImmediateCancellation: true, cancellationFeedback: 'unused' }
			)
		).resolves.toEqual({
			success: true,
			stripeCustomerId: 'cus_123',
			canceledSubscriptionId: 'sub_123',
			billingTransitionApplied: true
		});

		expect(ctx.billingPort.calls).toContainEqual({
			method: 'cancelSubscription',
			args: ['sub_123', { cancellationFeedback: 'unused' }]
		});
		expect(billingCancellationTransition.applyImmediateCancellation).toHaveBeenCalledWith({
			orgId: ctx.auth.orgId,
			stripeCustomerId: 'cus_123',
			cancellationFeedback: 'unused'
		});
	});

	it('keeps provider cancellation successful when the local cancellation transition fails', async () => {
		const ctx = createTestContext();
		const billingCancellationTransition = {
			applyImmediateCancellation: vi.fn(async () => {
				throw new Error('snapshot unavailable');
			})
		};
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

		await expect(
			cancelBillingSubscriptionForOrganizationWithTransition(
				{ ...ctx, billingCancellationTransition },
				{ confirmedImmediateCancellation: true }
			)
		).resolves.toEqual({
			success: true,
			stripeCustomerId: 'cus_123',
			canceledSubscriptionId: 'sub_123',
			billingTransitionApplied: false
		});

		expect(ctx.billingPort.calls).toContainEqual({
			method: 'cancelSubscription',
			args: ['sub_123', { cancellationFeedback: null }]
		});
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('[billing] Immediate cancellation snapshot for organization test-org will be reconciled'),
			expect.any(Error)
		);
		warnSpy.mockRestore();
	});
});
