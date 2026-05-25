import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';

const { buildRouteContextMock } = vi.hoisted(() => ({
	buildRouteContextMock: vi.fn()
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

import { POST } from './+server';

function clearPublicOriginConfig() {
	vi.stubEnv('APP_PUBLIC_ORIGIN', '');
	vi.stubEnv('PUBLIC_APP_ORIGIN', '');
	vi.stubEnv('PUBLIC_SITE_URL', '');
	vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', '');
}

function seedBillingOrganization(ctx: ReturnType<typeof createTestContext>, customerId: string | null = 'cus_123') {
	ctx.rawStore.seed('organizations', [
		{
			id: ctx.auth.orgId,
			name: 'Alpha Company',
			tier: 'team',
			stripe_customer_id: customerId,
			stripe_subscription_id: 'sub_123',
			subscription_status: 'active'
		}
	]);
}

function seedBillingSnapshot(ctx: ReturnType<typeof createTestContext>, customerId = 'cus_123') {
	ctx.rawStore.seed('organization_billing_snapshots', [
		{
			id: 'snapshot-1',
			organization_id: ctx.auth.orgId,
			source: 'stripe',
			commercial_plan: 'team',
			stripe_customer_id: customerId,
			stripe_subscription_id: 'sub_123',
			stripe_product_id: 'prod_team',
			stripe_price_id: 'price_team',
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
}

function portalEvent(ctx: ReturnType<typeof createTestContext>, origin = 'http://localhost') {
	return {
		request: new Request(`${origin}/org/${ctx.auth.orgId}/billing/portal`, {
			method: 'POST'
		}),
		locals: {
			user: { email: 'owner@example.com' }
		},
		params: { orgId: ctx.auth.orgId },
		url: new URL(`${origin}/org/${ctx.auth.orgId}/billing/portal`)
	} as never;
}

describe('POST /billing/portal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearPublicOriginConfig();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('opens the billing portal using the persisted Stripe customer id from the app-owned store', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		seedBillingSnapshot(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ url: 'https://portal.test/session' });
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createPortalSession',
			args: ['cus_123', `http://localhost/org/${ctx.auth.orgId}/billing`]
		});
	});

	it('rejects portal access when the current organization has no local billing customer', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx, null);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'No active subscription found for this organization' });
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('opens the portal for legacy paid organizations while billing snapshots catch up', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx, 'cus_legacy');
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ url: 'https://portal.test/session' });
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createPortalSession',
			args: ['cus_legacy', `http://localhost/org/${ctx.auth.orgId}/billing`]
		});
	});

	it('opens the portal from the billing snapshot when the organization mirror has not caught up', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx, null);
		seedBillingSnapshot(ctx, 'cus_snapshot');
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx));

		expect(response.status).toBe(200);
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createPortalSession',
			args: ['cus_snapshot', `http://localhost/org/${ctx.auth.orgId}/billing`]
		});
	});

	it('rejects legacy billing snapshots until support reconciles them with Stripe', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx, 'cus_legacy');
		seedBillingSnapshot(ctx, 'cus_legacy');
		await ctx.rawStore.update('organization_billing_snapshots', ctx.auth.orgId, 'snapshot-1', {
			source: 'legacy_organization',
			sync_status: 'needs_reconciliation',
			drift_detected: true
		});
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx));

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: 'Billing customer state needs support review before opening the portal'
		});
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('rejects portal access when billing snapshot and organization customer ids disagree', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx, 'cus_organization');
		seedBillingSnapshot(ctx, 'cus_snapshot');
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx));

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: 'Billing customer state needs support review before opening the portal'
		});
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('rejects non-owner billing portal access before creating a provider session', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false
			}
		});
		seedBillingOrganization(ctx);
		seedBillingSnapshot(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx));

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'Only the organization owner can perform this action' });
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('rejects stale-session portal access before creating a provider session', async () => {
		const ctx = createTestContext({
			sensitiveActionDecision: {
				allowed: false,
				reason: 'denied.staleSession',
				sessionAgeMs: 3_600_000,
				requiresStepUp: true
			}
		});
		seedBillingOrganization(ctx);
		seedBillingSnapshot(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx));

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.',
			reason: 'denied.staleSession',
			requiresStepUp: true,
			stepUpPath: '/auth/login'
		});
		expect(ctx.billingPort.calls).toEqual([]);
	});

	it('builds portal return URLs from the official public app origin instead of a spoofed inbound host', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://app.trooptotask.com');
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		seedBillingSnapshot(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx, 'https://spoofed.example'));

		expect(response.status).toBe(200);
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createPortalSession',
			args: ['cus_123', `https://app.trooptotask.com/org/${ctx.auth.orgId}/billing`]
		});
	});

	it('allows explicitly allowlisted preview origins for portal return URLs', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://billing-preview.trooptotask.dev');
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		seedBillingSnapshot(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx, 'https://billing-preview.trooptotask.dev'));

		expect(response.status).toBe(200);
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createPortalSession',
			args: ['cus_123', `https://billing-preview.trooptotask.dev/org/${ctx.auth.orgId}/billing`]
		});
	});

	it('rejects non-local portal origins when no official origin or preview allowlist is configured', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		seedBillingSnapshot(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(portalEvent(ctx, 'https://admin.trooptotask.org'));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Official public app origin is not configured for this host' });
		expect(ctx.billingPort.calls).toEqual([]);
	});
});
