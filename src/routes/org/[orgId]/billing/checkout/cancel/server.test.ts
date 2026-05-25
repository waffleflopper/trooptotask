import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { CHECKOUT_ATTEMPTS_TABLE } from '$lib/server/core/useCases/billingCheckoutAttempts';

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

function cancelCheckoutEvent(ctx: ReturnType<typeof createTestContext>) {
	return {
		request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/checkout/cancel`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		}),
		locals: {
			user: { email: 'owner@example.com' }
		},
		params: { orgId: ctx.auth.orgId },
		url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/checkout/cancel`)
	} as never;
}

describe('POST /billing/checkout/cancel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('allows an owner to cancel the active provider checkout session immediately', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [
			{
				id: 'attempt-unit',
				organization_id: ctx.auth.orgId,
				stripe_checkout_session_id: 'cs_unit',
				stripe_customer_id: 'cus_unit',
				commercial_plan: 'unit',
				stripe_price_id: 'price_unit',
				checkout_url: 'https://checkout.test/unit',
				status: 'in_progress',
				expires_at: '2099-01-01T00:00:00.000Z',
				completed_at: null,
				canceled_at: null,
				created_at: '2026-05-24T09:00:00.000Z',
				updated_at: '2026-05-24T09:00:00.000Z'
			}
		]);
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(cancelCheckoutEvent(ctx));

		const attempt = await ctx.rawStore.findOne<Record<string, unknown>>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId, {
			id: 'attempt-unit'
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			success: true,
			canceled: true,
			checkoutAttemptId: 'attempt-unit'
		});
		expect(ctx.billingPort.calls).toContainEqual({ method: 'expireCheckoutSession', args: ['cs_unit'] });
		expect(attempt).toMatchObject({
			status: 'canceled',
			canceled_at: expect.any(String)
		});
	});

	it('denies non-owner checkout cancellation before provider calls', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin'
			}
		});
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(cancelCheckoutEvent(ctx));

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: 'Only the organization owner can perform this action'
		});
		expect(ctx.billingPort.calls).toEqual([]);
	});
});
