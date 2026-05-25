import { describe, it, expect } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { TAX_DISABLED_CHECKOUT_SESSION_CONFIGURATION } from '$lib/server/billing/checkoutConfiguration';
import { checkout, portal, cancel, cancelPendingCheckout } from './billing';
import { CHECKOUT_ATTEMPTS_TABLE, type CheckoutAttemptRow } from './billingCheckoutAttempts';

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
				checkoutAttemptId: result.checkoutAttemptId,
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				checkoutConfiguration: TAX_DISABLED_CHECKOUT_SESSION_CONFIGURATION
			});
			expect(ctx.billingPort.calls[0].args[0]).toMatchObject({
				successUrl: `http://localhost/org/org-1/billing/success?checkout_attempt_id=${result.checkoutAttemptId}`,
				cancelUrl: `http://localhost/org/org-1/billing/canceled?checkout_attempt_id=${result.checkoutAttemptId}`
			});
			const attempt = await ctx.rawStore.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId, {
				id: result.checkoutAttemptId
			});
			expect(attempt).toMatchObject({
				status: 'in_progress',
				stripe_checkout_session_id: 'cs_test_123',
				stripe_customer_id: 'cus_test_123',
				commercial_plan: 'team',
				stripe_price_id: 'price_team',
				checkout_url: 'https://checkout.test/session'
			});
			expect(attempt?.expires_at).toBe('2026-05-24T12:00:00.000Z');
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.checkout_authorized',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						tier: 'team',
						checkoutAttemptId: result.checkoutAttemptId,
						sensitiveAction: expect.objectContaining({
							action: 'billing.checkout',
							reason: 'allowed.recentSession'
						})
					}
				}
			]);
		});

		it('passes caller-supplied checkout configuration to the billing port', async () => {
			const ctx = buildContext();
			const checkoutConfiguration = {
				billingAddressCollection: 'required' as const,
				automaticTax: { enabled: true },
				customerUpdate: { address: 'auto' as const, name: 'auto' as const }
			};

			await checkout(ctx, {
				tier: 'team',
				priceId: 'price_team',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled',
				checkoutConfiguration
			});

			expect(ctx.billingPort.calls[0].args[0]).toMatchObject({
				checkoutConfiguration
			});
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
						checkoutAttemptId: result.checkoutAttemptId,
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

		it('reuses an active in-progress checkout attempt after sensitive-action authorization', async () => {
			const ctx = buildContext();
			const now = new Date('2026-05-24T10:00:00.000Z');
			ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
				{
					id: 'attempt-active',
					organization_id: ctx.auth.orgId,
					stripe_checkout_session_id: 'cs_active',
					stripe_customer_id: 'cus_active',
					commercial_plan: 'team',
					stripe_price_id: 'price_team',
					checkout_url: 'https://checkout.test/active',
					status: 'in_progress',
					expires_at: '2026-05-24T11:00:00.000Z',
					completed_at: null,
					canceled_at: null,
					created_at: '2026-05-24T09:00:00.000Z',
					updated_at: '2026-05-24T09:00:00.000Z'
				}
			]);

			const result = await checkout(ctx, {
				tier: 'team',
				priceId: 'price_team',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled',
				now
			});

			expect(result).toEqual({
				url: 'https://checkout.test/active',
				customerId: 'cus_active',
				reused: true,
				message: 'A checkout session is already open. Redirecting you back to it.',
				checkoutAttemptId: 'attempt-active'
			});
			expect(ctx.billingPort.calls).toEqual([]);
			expect(ctx.auditPort.events).toContainEqual(
				expect.objectContaining({
					action: 'billing.checkout_reused',
					details: expect.objectContaining({ checkoutAttemptId: 'attempt-active' })
				})
			);
		});

		it('blocks an active checkout attempt for a different plan instead of reusing the wrong URL', async () => {
			const ctx = buildContext();
			ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
				{
					id: 'attempt-team',
					organization_id: ctx.auth.orgId,
					stripe_checkout_session_id: 'cs_team',
					stripe_customer_id: 'cus_team',
					commercial_plan: 'team',
					stripe_price_id: 'price_team',
					checkout_url: 'https://checkout.test/team',
					status: 'in_progress',
					expires_at: '2026-05-24T11:00:00.000Z',
					completed_at: null,
					canceled_at: null,
					created_at: '2026-05-24T09:00:00.000Z',
					updated_at: '2026-05-24T09:00:00.000Z'
				}
			]);

			await expect(
				checkout(ctx, {
					tier: 'unit',
					priceId: 'price_unit',
					customerEmail: 'owner@test.com',
					orgName: 'Test Org',
					successUrl: 'http://localhost/success',
					cancelUrl: 'http://localhost/canceled',
					now: new Date('2026-05-24T10:00:00.000Z')
				})
			).rejects.toMatchObject({
				status: 409,
				message:
					'A checkout session is already open for a different plan. Complete or wait for that session to expire before starting another checkout.'
			});
			expect(ctx.billingPort.calls).toEqual([]);
		});

		it('expires the provider session and marks an active checkout attempt canceled', async () => {
			const ctx = buildContext();
			const now = new Date('2026-05-24T10:00:00.000Z');
			ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
				{
					id: 'attempt-active',
					organization_id: ctx.auth.orgId,
					stripe_checkout_session_id: 'cs_active',
					stripe_customer_id: 'cus_active',
					commercial_plan: 'unit',
					stripe_price_id: 'price_unit',
					checkout_url: 'https://checkout.test/unit',
					status: 'in_progress',
					expires_at: '2026-05-24T11:00:00.000Z',
					completed_at: null,
					canceled_at: null,
					created_at: '2026-05-24T09:00:00.000Z',
					updated_at: '2026-05-24T09:00:00.000Z'
				}
			]);

			const result = await cancelPendingCheckout(ctx, { now });

			const attempt = await ctx.rawStore.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId, {
				id: 'attempt-active'
			});
			expect(result).toEqual({ success: true, canceled: true, checkoutAttemptId: 'attempt-active' });
			expect(ctx.billingPort.calls).toContainEqual({ method: 'expireCheckoutSession', args: ['cs_active'] });
			expect(attempt).toMatchObject({
				status: 'canceled',
				canceled_at: '2026-05-24T10:00:00.000Z'
			});
			expect(ctx.auditPort.events).toContainEqual(
				expect.objectContaining({
					action: 'billing.checkout_canceled',
					details: expect.objectContaining({
						checkoutAttemptId: 'attempt-active',
						commercialPlan: 'unit'
					})
				})
			);
		});

		it('treats missing active checkout attempts as already canceled', async () => {
			const ctx = buildContext();

			await expect(cancelPendingCheckout(ctx, { now: new Date('2026-05-24T10:00:00.000Z') })).resolves.toEqual({
				success: true,
				canceled: false,
				checkoutAttemptId: null
			});
			expect(ctx.billingPort.calls).toEqual([]);
		});

		it('returns clear retry copy when another request is still creating the provider session', async () => {
			const ctx = buildContext();
			ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
				{
					id: 'attempt-placeholder',
					organization_id: ctx.auth.orgId,
					stripe_checkout_session_id: null,
					stripe_customer_id: null,
					commercial_plan: 'team',
					stripe_price_id: 'price_team',
					checkout_url: null,
					status: 'in_progress',
					expires_at: '2026-05-24T10:04:00.000Z',
					completed_at: null,
					canceled_at: null,
					created_at: '2026-05-24T09:59:00.000Z',
					updated_at: '2026-05-24T09:59:00.000Z'
				}
			]);

			await expect(
				checkout(ctx, {
					tier: 'team',
					priceId: 'price_team',
					customerEmail: 'owner@test.com',
					orgName: 'Test Org',
					successUrl: 'http://localhost/success',
					cancelUrl: 'http://localhost/canceled',
					now: new Date('2026-05-24T10:00:00.000Z')
				})
			).rejects.toMatchObject({
				status: 409,
				message: 'A checkout session is being created for this organization. Please try again shortly.'
			});
			expect(ctx.billingPort.calls).toEqual([]);
		});

		it('blocks a checkout when the unique-constraint fallback sees a placeholder without a provider URL', async () => {
			const ctx = buildContext();
			const now = new Date('2026-05-24T10:00:00.000Z');
			const originalFindMany = ctx.rawStore.findMany.bind(ctx.rawStore);
			const originalInsert = ctx.rawStore.insert.bind(ctx.rawStore);
			let findManyCalls = 0;

			ctx.rawStore.findMany = ((...args: Parameters<typeof ctx.rawStore.findMany>) => {
				findManyCalls += 1;
				if (args[0] === CHECKOUT_ATTEMPTS_TABLE && findManyCalls <= 2) return Promise.resolve([]);
				return originalFindMany(...args);
			}) as typeof ctx.rawStore.findMany;
			ctx.rawStore.insert = (async (...args: Parameters<typeof ctx.rawStore.insert>) => {
				if (args[0] === CHECKOUT_ATTEMPTS_TABLE) {
					await originalInsert(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId, {
						id: 'attempt-racing-placeholder',
						stripe_checkout_session_id: null,
						stripe_customer_id: null,
						commercial_plan: 'team',
						stripe_price_id: 'price_team',
						checkout_url: null,
						status: 'in_progress',
						expires_at: '2026-05-24T10:05:00.000Z',
						completed_at: null,
						canceled_at: null,
						created_at: now.toISOString(),
						updated_at: now.toISOString()
					});
					throw new Error('duplicate key violates unique constraint "organization_checkout_attempts_active_org_key"');
				}
				return originalInsert(...args);
			}) as typeof ctx.rawStore.insert;

			await expect(
				checkout(ctx, {
					tier: 'team',
					priceId: 'price_team',
					customerEmail: 'owner@test.com',
					orgName: 'Test Org',
					successUrl: 'http://localhost/success',
					cancelUrl: 'http://localhost/canceled',
					now
				})
			).rejects.toMatchObject({
				status: 409,
				message: 'A checkout session is being created for this organization. Please try again shortly.'
			});
			expect(ctx.billingPort.calls).toEqual([]);
		});

		it('expires stale placeholder attempts before creating a replacement', async () => {
			const ctx = buildContext();
			const now = new Date('2026-05-24T10:00:00.000Z');
			ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
				{
					id: 'attempt-stale-placeholder',
					organization_id: ctx.auth.orgId,
					stripe_checkout_session_id: null,
					stripe_customer_id: null,
					commercial_plan: 'team',
					stripe_price_id: 'price_team',
					checkout_url: null,
					status: 'in_progress',
					expires_at: null,
					completed_at: null,
					canceled_at: null,
					created_at: '2026-05-24T09:40:00.000Z',
					updated_at: '2026-05-24T09:40:00.000Z'
				}
			]);

			const result = await checkout(ctx, {
				tier: 'team',
				priceId: 'price_team',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled',
				now
			});

			const attempts = await ctx.rawStore.findMany<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId);
			expect(result.reused).toBe(false);
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(attempts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: 'attempt-stale-placeholder', status: 'expired' }),
					expect.objectContaining({ id: result.checkoutAttemptId, status: 'in_progress' })
				])
			);
		});

		it('expires stale ready attempts without provider expiry before creating a replacement', async () => {
			const ctx = buildContext();
			const now = new Date('2026-05-24T10:00:00.000Z');
			ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
				{
					id: 'attempt-stale-no-provider-expiry',
					organization_id: ctx.auth.orgId,
					stripe_checkout_session_id: 'cs_no_provider_expiry',
					stripe_customer_id: 'cus_no_provider_expiry',
					commercial_plan: 'team',
					stripe_price_id: 'price_team',
					checkout_url: 'https://checkout.test/no-provider-expiry',
					status: 'in_progress',
					expires_at: null,
					completed_at: null,
					canceled_at: null,
					created_at: '2026-05-24T09:40:00.000Z',
					updated_at: '2026-05-24T09:40:00.000Z'
				}
			]);

			const result = await checkout(ctx, {
				tier: 'team',
				priceId: 'price_team',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled',
				now
			});

			const attempts = await ctx.rawStore.findMany<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId);
			expect(result.reused).toBe(false);
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(attempts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: 'attempt-stale-no-provider-expiry', status: 'expired' }),
					expect.objectContaining({ id: result.checkoutAttemptId, status: 'in_progress' })
				])
			);
		});

		it('expires stale checkout attempts before creating a replacement', async () => {
			const ctx = buildContext();
			const now = new Date('2026-05-24T10:00:00.000Z');
			ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
				{
					id: 'attempt-stale',
					organization_id: ctx.auth.orgId,
					stripe_checkout_session_id: 'cs_stale',
					stripe_customer_id: 'cus_stale',
					commercial_plan: 'team',
					stripe_price_id: 'price_team',
					checkout_url: 'https://checkout.test/stale',
					status: 'in_progress',
					expires_at: '2026-05-24T09:59:59.000Z',
					completed_at: null,
					canceled_at: null,
					created_at: '2026-05-24T09:00:00.000Z',
					updated_at: '2026-05-24T09:00:00.000Z'
				}
			]);

			const result = await checkout(ctx, {
				tier: 'team',
				priceId: 'price_team',
				customerEmail: 'owner@test.com',
				orgName: 'Test Org',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled',
				now
			});

			const attempts = await ctx.rawStore.findMany<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId);
			expect(result.reused).toBe(false);
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(attempts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: 'attempt-stale', status: 'expired' }),
					expect.objectContaining({ id: result.checkoutAttemptId, status: 'in_progress' })
				])
			);
		});

		it.each(['completed', 'canceled'] as const)(
			'does not let %s checkout attempts block a new checkout',
			async (status) => {
				const ctx = buildContext();
				ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
					{
						id: `attempt-${status}`,
						organization_id: ctx.auth.orgId,
						stripe_checkout_session_id: `cs_${status}`,
						stripe_customer_id: `cus_${status}`,
						commercial_plan: 'team',
						stripe_price_id: 'price_team',
						checkout_url: `https://checkout.test/${status}`,
						status,
						expires_at: '2026-05-24T11:00:00.000Z',
						completed_at: status === 'completed' ? '2026-05-24T09:30:00.000Z' : null,
						canceled_at: status === 'canceled' ? '2026-05-24T09:30:00.000Z' : null,
						created_at: '2026-05-24T09:00:00.000Z',
						updated_at: '2026-05-24T09:30:00.000Z'
					}
				]);

				const result = await checkout(ctx, {
					tier: 'team',
					priceId: 'price_team',
					customerEmail: 'owner@test.com',
					orgName: 'Test Org',
					successUrl: 'http://localhost/success',
					cancelUrl: 'http://localhost/canceled',
					now: new Date('2026-05-24T10:00:00.000Z')
				});

				expect(result.reused).toBe(false);
				expect(ctx.billingPort.calls).toHaveLength(1);
			}
		);

		it('denies stale-session checkout before reusing an active attempt', async () => {
			const ctx = createTestContext({
				sensitiveActionDecision: {
					allowed: false,
					reason: 'denied.staleSession',
					sessionAgeMs: 3_600_000,
					requiresStepUp: true
				}
			});
			ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
				{
					id: 'attempt-active',
					organization_id: ctx.auth.orgId,
					stripe_checkout_session_id: 'cs_active',
					stripe_customer_id: 'cus_active',
					commercial_plan: 'team',
					stripe_price_id: 'price_team',
					checkout_url: 'https://checkout.test/active',
					status: 'in_progress',
					expires_at: '2026-05-24T11:00:00.000Z',
					completed_at: null,
					canceled_at: null,
					created_at: '2026-05-24T09:00:00.000Z',
					updated_at: '2026-05-24T09:00:00.000Z'
				}
			]);

			await expect(
				checkout(ctx, {
					tier: 'team',
					priceId: 'price_team',
					customerEmail: 'owner@test.com',
					orgName: 'Test Org',
					successUrl: 'http://localhost/success',
					cancelUrl: 'http://localhost/canceled',
					now: new Date('2026-05-24T10:00:00.000Z')
				})
			).rejects.toMatchObject({ status: 403 });

			expect(ctx.billingPort.calls).toEqual([]);
			expect(ctx.auditPort.events).toEqual([
				expect.objectContaining({ action: 'billing.checkout_authorization_denied' })
			]);
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

			const result = await cancel(ctx, {
				subscriptionId: 'sub_abc',
				confirmedImmediateCancellation: true,
				cancellationFeedback: 'unused'
			});

			expect(result.success).toBe(true);
			expect(result.orgUpdates).toEqual({
				tier: 'free',
				subscription_status: null,
				stripe_subscription_id: null,
				current_period_end: null
			});
			expect(ctx.billingPort.calls).toHaveLength(1);
			expect(ctx.billingPort.calls[0].method).toBe('cancelSubscription');
			expect(ctx.billingPort.calls[0].args).toEqual(['sub_abc', { cancellationFeedback: 'unused' }]);
			expect(ctx.auditPort.events).toEqual([
				{
					action: 'billing.cancel_authorized',
					resourceType: 'organization',
					resourceId: 'test-org',
					details: {
						cancellationMode: 'immediate',
						cancellationFeedback: 'unused',
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

			await expect(
				cancel(ctx, { subscriptionId: 'sub_abc', confirmedImmediateCancellation: true })
			).rejects.toMatchObject({ status: 403 });

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

		it('rejects immediate cancellation without explicit confirmation before sensitive-action checks', async () => {
			const ctx = buildContext();

			await expect(cancel(ctx, { subscriptionId: 'sub_abc' })).rejects.toMatchObject({
				status: 400,
				message: 'Immediate cancellation requires explicit owner confirmation'
			});
			expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
			expect(ctx.billingPort.calls).toEqual([]);
		});
	});
});
