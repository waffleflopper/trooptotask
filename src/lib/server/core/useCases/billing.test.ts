import { describe, it, expect } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { checkout, portal, cancel } from './billing';

function buildContext() {
	return createTestContext();
}

describe('billing use cases', () => {
	describe('checkout', () => {
		it('calls billing port with correct params and returns checkout URL + customerId', async () => {
			const ctx = buildContext();

			const result = await checkout(ctx, {
				tier: 'team',
				priceId: 'price_team',
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
				priceId: 'price_team',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org'
			});
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.checkout_authorized',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						tier: 'team',
						sensitiveAction: expect.objectContaining({
							action: 'billing.checkout',
							reason: 'allowed.recentSession'
						})
					}
				}
			]);
		});

		it('allows checkout when MFA assurance satisfies the sensitive-action check', async () => {
			const ctx = createTestContext({
				sensitiveActionDecision: {
					reason: 'allowed.mfaAssurance',
					currentAssuranceLevel: 'aal2',
					nextAssuranceLevel: 'aal2',
					sessionAgeMs: 3_600_000
				}
			});

			const result = await checkout(ctx, {
				tier: 'unit',
				priceId: 'price_unit',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled'
			});

			expect(result.url).toBe('https://checkout.test/session');
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.checkout_authorized',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						tier: 'unit',
						sensitiveAction: expect.objectContaining({
							action: 'billing.checkout',
							reason: 'allowed.mfaAssurance',
							currentAssuranceLevel: 'aal2'
						})
					}
				}
			]);
		});

		it('denies stale-session checkout before creating a provider session', async () => {
			const ctx = createTestContext({
				sensitiveActionDecision: {
					allowed: false,
					reason: 'denied.staleSession',
					sessionAgeMs: 3_600_000,
					requiresStepUp: true
				}
			});

			await expect(
				checkout(ctx, {
					tier: 'team',
					priceId: 'price_team',
					customerEmail: 'owner@test.com',
					orgName: 'Test Org',
					successUrl: 'http://localhost/success',
					cancelUrl: 'http://localhost/canceled'
				})
			).rejects.toMatchObject({
				status: 403,
				message: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.'
			});

			expect(ctx.billingPort.calls).toEqual([]);
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.checkout_authorization_denied',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						tier: 'team',
						sensitiveAction: expect.objectContaining({
							action: 'billing.checkout',
							reason: 'denied.staleSession',
							requiresStepUp: true
						})
					},
					severity: 'warning'
				}
			]);
		});

		it('denies checkout without a signed-in actor before calling the authorizer port', async () => {
			const ctx = createTestContext({
				auth: {
					userId: null
				}
			});

			await expect(
				checkout(ctx, {
					tier: 'team',
					priceId: 'price_team',
					customerEmail: 'owner@test.com',
					orgName: 'Test Org',
					successUrl: 'http://localhost/success',
					cancelUrl: 'http://localhost/canceled'
				})
			).rejects.toMatchObject({
				status: 403,
				message: 'Please sign in again before continuing.'
			});

			expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
			expect(ctx.billingPort.calls).toEqual([]);
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.checkout_authorization_denied',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						tier: 'team',
						sensitiveAction: expect.objectContaining({
							action: 'billing.checkout',
							reason: 'denied.unauthenticated'
						})
					},
					severity: 'warning'
				}
			]);
		});

		it('passes existingCustomerId when provided', async () => {
			const ctx = buildContext();

			await checkout(ctx, {
				tier: 'unit',
				priceId: 'price_unit',
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
			const ctx = buildContext();

			await expect(
				checkout(ctx, {
					tier: 'team',
					priceId: 'price_team',
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
			const ctx = buildContext();

			const result = await portal(ctx, {
				customerId: 'cus_123',
				returnUrl: 'http://localhost/org/org-1/billing'
			});

			expect(result.url).toBe('https://portal.test/session');
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(ctx.billingPort.calls[0].method).toBe('createPortalSession');
			expect(ctx.billingPort.calls[0].args).toEqual(['cus_123', 'http://localhost/org/org-1/billing']);
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.portal_authorized',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						sensitiveAction: expect.objectContaining({
							action: 'billing.portal',
							reason: 'allowed.recentSession'
						})
					}
				}
			]);
		});

		it('denies stale-session portal access before opening a provider portal session', async () => {
			const ctx = createTestContext({
				sensitiveActionDecision: {
					allowed: false,
					reason: 'denied.staleSession',
					sessionAgeMs: 3_600_000,
					requiresStepUp: true
				}
			});

			await expect(
				portal(ctx, {
					customerId: 'cus_123',
					returnUrl: 'http://localhost/org/org-1/billing'
				})
			).rejects.toMatchObject({ status: 403 });

			expect(ctx.billingPort.calls).toEqual([]);
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.portal_authorization_denied',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						sensitiveAction: expect.objectContaining({
							action: 'billing.portal',
							reason: 'denied.staleSession'
						})
					},
					severity: 'warning'
				}
			]);
		});

		it('rejects when customerId is missing', async () => {
			const ctx = buildContext();

			await expect(portal(ctx, { customerId: '', returnUrl: 'http://localhost/billing' })).rejects.toThrow(
				/subscription/i
			);
		});
	});

	describe('cancel', () => {
		it('calls billing port and returns orgUpdates to reset to free tier', async () => {
			const ctx = buildContext();

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
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.cancel_authorized',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						sensitiveAction: expect.objectContaining({
							action: 'billing.cancel',
							reason: 'allowed.recentSession'
						})
					}
				}
			]);
		});

		it('denies stale-session cancellation before cancelling with the provider', async () => {
			const ctx = createTestContext({
				sensitiveActionDecision: {
					allowed: false,
					reason: 'denied.staleSession',
					sessionAgeMs: 3_600_000,
					requiresStepUp: true
				}
			});

			await expect(cancel(ctx, { subscriptionId: 'sub_abc' })).rejects.toMatchObject({ status: 403 });

			expect(ctx.billingPort.calls).toEqual([]);
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

		it('rejects when subscriptionId is missing', async () => {
			const ctx = buildContext();

			await expect(cancel(ctx, { subscriptionId: '' })).rejects.toThrow(/subscription/i);
		});
	});
});
