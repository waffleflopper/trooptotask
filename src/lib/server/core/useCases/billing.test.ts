import { describe, it, expect } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { checkout, portal, cancel } from './billing';

describe('billing use cases', () => {
	describe('checkout', () => {
		it('calls billing port with correct params and returns checkout URL + customerId', async () => {
			const ctx = createTestContext();

			const result = await checkout(ctx, {
				tier: 'team',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				successUrl: 'http://localhost/org/org-1/billing/success',
				cancelUrl: 'http://localhost/org/org-1/billing/canceled'
			});

			expect(result.url).toBe('https://checkout.test/session');
			expect(result.customerId).toBe('cus_test_123');
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(ctx.billingPort.calls[0].method).toBe('createCheckoutSession');
			expect(ctx.billingPort.calls[0].args[0]).toMatchObject({
				orgId: 'test-org',
				tier: 'team',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org'
			});
		});

		it('passes existingCustomerId when provided', async () => {
			const ctx = createTestContext();

			await checkout(ctx, {
				tier: 'unit',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				existingCustomerId: 'cus_existing',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled'
			});

			expect(ctx.billingPort.calls[0].args[0]).toMatchObject({
				existingCustomerId: 'cus_existing'
			});
		});

		it('rejects when customerEmail is empty', async () => {
			const ctx = createTestContext();

			await expect(
				checkout(ctx, {
					tier: 'team',
					customerEmail: '',
					orgName: 'Test Org',
					successUrl: 'http://localhost/success',
					cancelUrl: 'http://localhost/canceled'
				})
			).rejects.toThrow(/email/i);
		});
	});

	describe('portal', () => {
		it('calls billing port and returns portal URL', async () => {
			const ctx = createTestContext();

			const result = await portal(ctx, {
				customerId: 'cus_123',
				returnUrl: 'http://localhost/org/org-1/billing'
			});

			expect(result.url).toBe('https://portal.test/session');
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(ctx.billingPort.calls[0].method).toBe('createPortalSession');
			expect(ctx.billingPort.calls[0].args).toEqual(['cus_123', 'http://localhost/org/org-1/billing']);
		});

		it('rejects when customerId is missing', async () => {
			const ctx = createTestContext();

			await expect(portal(ctx, { customerId: '', returnUrl: 'http://localhost/billing' })).rejects.toThrow(
				/subscription/i
			);
		});
	});

	describe('cancel', () => {
		it('calls billing port and returns orgUpdates to reset to free tier', async () => {
			const ctx = createTestContext();

			const result = await cancel(ctx, { subscriptionId: 'sub_abc' });

			expect(result.success).toBe(true);
			expect(result.orgUpdates).toEqual({
				tier: 'free',
				subscription_status: null,
				stripe_subscription_id: null
			});
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(ctx.billingPort.calls[0].method).toBe('cancelSubscription');
			expect(ctx.billingPort.calls[0].args).toEqual(['sub_abc']);
		});

		it('rejects when subscriptionId is missing', async () => {
			const ctx = createTestContext();

			await expect(cancel(ctx, { subscriptionId: '' })).rejects.toThrow(/subscription/i);
		});
	});
});
