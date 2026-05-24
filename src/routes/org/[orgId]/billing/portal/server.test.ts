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

function seedBillingOrganization(ctx: ReturnType<typeof createTestContext>) {
	ctx.rawStore.seed('organizations', [
		{
			id: ctx.auth.orgId,
			name: 'Alpha Company',
			tier: 'team',
			stripe_customer_id: 'cus_123',
			stripe_subscription_id: 'sub_123',
			subscription_status: 'active'
		}
	]);
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
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/portal`, {
				method: 'POST'
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/portal`)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ url: 'https://portal.test/session' });
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createPortalSession',
			args: ['cus_123', `http://localhost/org/${ctx.auth.orgId}/billing`]
		});
	});

	it('builds portal return URLs from the official public app origin instead of a spoofed inbound host', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://app.trooptotask.com');
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`https://spoofed.example/org/${ctx.auth.orgId}/billing/portal`, {
				method: 'POST'
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`https://spoofed.example/org/${ctx.auth.orgId}/billing/portal`)
		} as never);

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
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`https://billing-preview.trooptotask.dev/org/${ctx.auth.orgId}/billing/portal`, {
				method: 'POST'
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`https://billing-preview.trooptotask.dev/org/${ctx.auth.orgId}/billing/portal`)
		} as never);

		expect(response.status).toBe(200);
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'createPortalSession',
			args: ['cus_123', `https://billing-preview.trooptotask.dev/org/${ctx.auth.orgId}/billing`]
		});
	});

	it('rejects non-local portal origins when no official origin or preview allowlist is configured', async () => {
		const ctx = createTestContext();
		seedBillingOrganization(ctx);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`https://admin.trooptotask.org/org/${ctx.auth.orgId}/billing/portal`, {
				method: 'POST'
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`https://admin.trooptotask.org/org/${ctx.auth.orgId}/billing/portal`)
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Official public app origin is not configured for this host' });
		expect(ctx.billingPort.calls).toEqual([]);
	});
});
