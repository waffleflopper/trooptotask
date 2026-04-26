import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('POST /billing/checkout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates a checkout session and persists the new Stripe customer id through the app-owned store', async () => {
		const ctx = createTestContext();
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
		expect(saved).toMatchObject({
			stripe_customer_id: 'cus_test_123',
			tier: 'free'
		});
	});

	it('allows owners to create a checkout session when the organization is read-only', async () => {
		const ctx = createTestContext({ readOnly: true });
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
});
