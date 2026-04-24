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

describe('POST /billing/cancel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('cancels the subscription and clears the org subscription state through the app-owned store', async () => {
		const ctx = createTestContext();
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
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/cancel`, {
				method: 'POST'
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/cancel`)
		} as never);

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(saved).toMatchObject({
			tier: 'free',
			stripe_customer_id: 'cus_123',
			stripe_subscription_id: null,
			subscription_status: null
		});
	});

	it('acknowledges cancellation when the post-Stripe local reset must be reconciled by webhook processing', async () => {
		const ctx = createTestContext();
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
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const originalUpdateById = ctx.rawStore.updateById.bind(ctx.rawStore);
		vi.spyOn(ctx.rawStore, 'updateById').mockImplementation(async (table, id, data) => {
			if (table === 'organizations') {
				throw new Error('local org update denied');
			}
			return originalUpdateById(table, id, data);
		});
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST({
			request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/cancel`, {
				method: 'POST'
			}),
			locals: {
				user: { email: 'owner@example.com' }
			},
			params: { orgId: ctx.auth.orgId },
			url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/cancel`)
		} as never);

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(ctx.billingPort.calls).toContainEqual({ method: 'cancelSubscription', args: ['sub_123'] });
		expect(saved).toMatchObject({
			tier: 'team',
			stripe_subscription_id: 'sub_123',
			subscription_status: 'active'
		});
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('[billing] Local cancellation state for organization test-org will be reconciled'),
			expect.any(Error)
		);
		warnSpy.mockRestore();
	});
});
