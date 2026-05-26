import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { CHECKOUT_ATTEMPTS_TABLE } from '$lib/server/core/useCases/billingCheckoutAttempts';

const { buildRouteContextMock, checkoutCatalogMock, checkoutConfigurationMock, checkoutConfigurationErrorMock } =
	vi.hoisted(() => ({
		buildRouteContextMock: vi.fn(),
		checkoutCatalogMock: [] as Array<{
			priceId: string;
			commercialPlan: 'team' | 'unit';
			stripeProductId: string | null;
			activeForCheckout: boolean;
		}>,
		checkoutConfigurationMock: {
			billingAddressCollection: 'auto' as 'auto' | 'required',
			automaticTax: { enabled: false },
			customerUpdate: { address: 'auto' as const, name: 'auto' as const }
		},
		checkoutConfigurationErrorMock: {
			message: ''
		}
	}));

vi.mock('$lib/config/billing', () => ({
	isBillingEnabled: true
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);

	return {
		...actual,
		buildRouteContext: buildRouteContextMock
	};
});

vi.mock('$lib/server/billing/priceCatalog', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/billing/priceCatalog')>(
		'$lib/server/billing/priceCatalog'
	);

	return {
		...actual,
		getConfiguredPriceCatalog: () => checkoutCatalogMock
	};
});

vi.mock('$lib/server/billing/checkoutConfiguration', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/billing/checkoutConfiguration')>(
		'$lib/server/billing/checkoutConfiguration'
	);

	return {
		...actual,
		resolveCheckoutSessionConfiguration: () => {
			if (checkoutConfigurationErrorMock.message) {
				throw new actual.CheckoutConfigurationError(checkoutConfigurationErrorMock.message);
			}
			return checkoutConfigurationMock;
		}
	};
});

import { POST } from './+server';

function clearPublicOriginConfig() {
	vi.stubEnv('APP_PUBLIC_ORIGIN', '');
	vi.stubEnv('PUBLIC_APP_ORIGIN', '');
	vi.stubEnv('PUBLIC_SITE_URL', '');
	vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', '');
}

function configureCheckoutPriceCatalog() {
	checkoutCatalogMock.splice(
		0,
		checkoutCatalogMock.length,
		{ priceId: 'price_team_current', commercialPlan: 'team', stripeProductId: null, activeForCheckout: true },
		{ priceId: 'price_unit_current', commercialPlan: 'unit', stripeProductId: null, activeForCheckout: true }
	);
}

function seedBillingOrganization(ctx: ReturnType<typeof createTestContext>) {
	ctx.rawStore.seed('organizations', [
		{
			id: ctx.auth.orgId,
			name: 'Alpha Company',
			tier: 'free',
			stripe_customer_id: null,
			stripe_subscription_id: null,
			subscription_status: null
		}
	]);
}

describe('POST /billing/checkout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearPublicOriginConfig();
		configureCheckoutPriceCatalog();
		checkoutConfigurationErrorMock.message = '';
		checkoutConfigurationMock.billingAddressCollection = 'auto';
		checkoutConfigurationMock.automaticTax.enabled = false;
		checkoutConfigurationMock.customerUpdate.address = 'auto';
		checkoutConfigurationMock.customerUpdate.name = 'auto';
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('creates a checkout session and persists the new Stripe customer id through the app-owned store', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ url: 'https://checkout.test/session' });
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createCheckoutSession',
			args: [
				expect.objectContaining({
					tier: 'team',
					priceId: 'price_team_current',
					checkoutConfiguration: {
						billingAddressCollection: 'auto',
						automaticTax: { enabled: false },
						customerUpdate: { address: 'auto', name: 'auto' }
					}
				})
			]
		});
		expect(saved).toMatchObject({
			stripe_customer_id: 'cus_test_123',
			tier: 'free'
		});
	});

	it('passes verified automatic-tax checkout options from server configuration', async () => {
		checkoutConfigurationMock.billingAddressCollection = 'required';
		checkoutConfigurationMock.automaticTax.enabled = true;
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(200);
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createCheckoutSession',
			args: [
				expect.objectContaining({
					checkoutConfiguration: {
						billingAddressCollection: 'required',
						automaticTax: { enabled: true },
						customerUpdate: { address: 'auto', name: 'auto' }
					}
				})
			]
		});
	});

	it('fails before session creation when automatic tax lacks dashboard verification', async () => {
		checkoutConfigurationErrorMock.message =
			'Automatic tax is enabled, but Stripe Tax dashboard setup has not been marked verified';
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: 'Checkout tax configuration needs support review before checkout can start.'
		});
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('rejects unsupported commercial plan selections before creating a checkout session', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'enterprise' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid tier. Must be "team" or "unit".' });
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('rejects arbitrary client-submitted Stripe price IDs', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team', priceId: 'price_attacker_controlled' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Stripe price IDs cannot be selected directly.' });
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('rejects invalid checkout payload shapes before property access', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'null'
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid checkout request.' });
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('denies checkout when the requested plan has no configured current Stripe price', async () => {
		checkoutCatalogMock.splice(0, checkoutCatalogMock.length, {
			priceId: 'price_unit_current',
			commercialPlan: 'unit',
			stripeProductId: null,
			activeForCheckout: true
		});
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: 'Checkout is temporarily unavailable.' });
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('builds checkout success and cancel URLs from the official public app origin', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://app.trooptotask.com');
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`https://spoofed.example/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`https://spoofed.example/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(200);
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createCheckoutSession',
			args: [
				expect.objectContaining({
					priceId: 'price_team_current',
					successUrl: expect.stringMatching(
						`^https://app\\.trooptotask\\.com/org/${ctx.auth.orgId}/billing/success\\?checkout_attempt_id=`
					),
					cancelUrl: expect.stringMatching(
						`^https://app\\.trooptotask\\.com/org/${ctx.auth.orgId}/billing/canceled\\?checkout_attempt_id=`
					)
				})
			]
		});
	});

	it('allows explicitly allowlisted preview origins when no official public app origin is configured', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://billing-preview.trooptotask.dev');
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`https://billing-preview.trooptotask.dev/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'unit' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`https://billing-preview.trooptotask.dev/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(200);
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createCheckoutSession',
			args: [
				expect.objectContaining({
					priceId: 'price_unit_current',
					successUrl: expect.stringMatching(
						`^https://billing-preview\\.trooptotask\\.dev/org/${ctx.auth.orgId}/billing/success\\?checkout_attempt_id=`
					),
					cancelUrl: expect.stringMatching(
						`^https://billing-preview\\.trooptotask\\.dev/org/${ctx.auth.orgId}/billing/canceled\\?checkout_attempt_id=`
					)
				})
			]
		});
	});

	it('rejects non-local checkout origins when no official origin or preview allowlist is configured', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`https://admin.trooptotask.org/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`https://admin.trooptotask.org/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Official public app origin is not configured for this host' });
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('denies non-owner checkout attempts through billing policy before reading organization billing state', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin'
			}
		});
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'admin@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: 'Only the organization owner can perform this action'
		});

		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'organization.manageBilling',
				details: expect.objectContaining({
					policyAction: 'organization.manageBilling',
					reasonCode: 'denied:owner-only',
					resource: { kind: 'organization' }
				}),
				severity: 'warning'
			})
		]);
	});

	it('returns step-up details when checkout is blocked by a stale sensitive session', async () => {
		const ctx = createTestContext({
			sensitiveActionDecision: {
				allowed: false,
				reason: 'denied.staleSession',
				sessionAgeMs: 60 * 60 * 1000,
				requiresStepUp: true
			}
		});
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			error: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.',
			reason: 'denied.staleSession',
			requiresStepUp: true,
			stepUpPath: '/auth/login'
		});
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('allows owners to create a checkout session when the organization is read-only', async () => {
		const ctx = createTestContext({ readOnly: true });
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'unit' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ url: 'https://checkout.test/session' });
	});

	it('reuses an active checkout attempt for clear duplicate-checkout behavior', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
			{
				id: 'attempt-active',
				organization_id: ctx.auth.orgId,
				stripe_checkout_session_id: 'cs_active',
				stripe_customer_id: 'cus_active',
				commercial_plan: 'team',
				stripe_price_id: 'price_team_current',
				checkout_url: 'https://checkout.test/active',
				status: 'in_progress',
				expires_at: '2099-01-01T00:00:00.000Z',
				completed_at: null,
				canceled_at: null,
				created_at: '2026-05-24T09:00:00.000Z',
				updated_at: '2026-05-24T09:00:00.000Z'
			}
		]);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			url: 'https://checkout.test/active',
			reused: true,
			message: 'A checkout session is already open. Redirecting you back to it.'
		});
		expect(ctx.billingPort.calls).toEqual([]);
		expect(saved?.stripe_customer_id).toBe('cus_active');
	});

	it('returns clear owner-facing copy when an active checkout attempt is for another plan', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
			{
				id: 'attempt-team',
				organization_id: ctx.auth.orgId,
				stripe_checkout_session_id: 'cs_team',
				stripe_customer_id: 'cus_team',
				commercial_plan: 'team',
				stripe_price_id: 'price_team_current',
				checkout_url: 'https://checkout.test/team',
				status: 'in_progress',
				expires_at: '2099-01-01T00:00:00.000Z',
				completed_at: null,
				canceled_at: null,
				created_at: '2026-05-24T09:00:00.000Z',
				updated_at: '2026-05-24T09:00:00.000Z'
			}
		]);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'unit' })
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout`)
		} as never);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error:
				'A checkout session is already open for a different plan. Complete or wait for that session to expire before starting another checkout.'
		});
		expect(ctx.billingPort.calls).toEqual([]);
	});
});
