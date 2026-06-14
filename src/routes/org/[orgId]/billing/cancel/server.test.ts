import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';

const { buildRouteContextMock, createSupabaseBillingCancellationTransitionPortMock, applyImmediateCancellationMock } =
	vi.hoisted(() => ({
		buildRouteContextMock: vi.fn(),
		createSupabaseBillingCancellationTransitionPortMock: vi.fn(),
		applyImmediateCancellationMock: vi.fn()
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

vi.mock('$lib/server/adapters/billingCancellationTransition', () => ({
	createSupabaseBillingCancellationTransitionPort: createSupabaseBillingCancellationTransitionPortMock
}));

import { POST } from './+server';

function cancelEvent(ctx: ReturnType<typeof createTestContext>, body: Record<string, unknown> = {}) {
	return {
		request: new Request(`http://localhost/org/${ctx.auth.orgId}/billing/cancel`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				confirmedImmediateCancellation: true,
				...body
			})
		}),
		locals: {
			user: { email: 'owner@example.com' }
		},
		params: { orgId: ctx.auth.orgId },
		url: new URL(`http://localhost/org/${ctx.auth.orgId}/billing/cancel`)
	} as never;
}

describe('POST /billing/cancel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		applyImmediateCancellationMock.mockResolvedValue(undefined);
		createSupabaseBillingCancellationTransitionPortMock.mockReturnValue({
			applyImmediateCancellation: applyImmediateCancellationMock
		});
	});

	it('cancels the subscription and records pending cancellation through the app-owned transition port', async () => {
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

		const response = await POST(cancelEvent(ctx, { cancellationFeedback: 'too_expensive' }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, billingTransitionApplied: true });
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'cancelSubscription',
			args: ['sub_123', { cancellationFeedback: 'too_expensive' }]
		});
		expect(createSupabaseBillingCancellationTransitionPortMock).toHaveBeenCalledOnce();
		expect(applyImmediateCancellationMock).toHaveBeenCalledWith({
			orgId: ctx.auth.orgId,
			stripeCustomerId: 'cus_123',
			cancellationFeedback: 'too_expensive'
		});
	});

	it('rejects immediate cancellation without explicit owner confirmation before calling Stripe', async () => {
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

		const response = await POST(cancelEvent(ctx, { confirmedImmediateCancellation: false }));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Immediate cancellation requires explicit owner confirmation' });
		expect(ctx.billingPort.calls).toEqual([]);
		expect(applyImmediateCancellationMock).not.toHaveBeenCalled();
	});

	it('rejects unsupported cancellation feedback before calling Stripe', async () => {
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

		const response = await POST(cancelEvent(ctx, { cancellationFeedback: 'hate_it' }));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Cancellation feedback is not supported' });
		expect(ctx.billingPort.calls).toEqual([]);
		expect(applyImmediateCancellationMock).not.toHaveBeenCalled();
	});

	it('blocks immediate cancellation while the organization is read-only', async () => {
		const ctx = createTestContext({ readOnly: true });
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

		const response = await POST(cancelEvent(ctx));

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'Organization is in read-only mode' });
		expect(ctx.billingPort.calls).toEqual([]);
		expect(applyImmediateCancellationMock).not.toHaveBeenCalled();
	});

	it('acknowledges cancellation when the snapshot transition mirror must be reconciled by webhook processing', async () => {
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
		applyImmediateCancellationMock.mockRejectedValue(new Error('mirror denied'));
		buildRouteContextMock.mockResolvedValue(ctx);

		const response = await POST(cancelEvent(ctx));

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, billingTransitionApplied: false });
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'cancelSubscription',
			args: ['sub_123', { cancellationFeedback: null }]
		});
		expect(saved).toMatchObject({
			tier: 'team',
			stripe_subscription_id: 'sub_123',
			subscription_status: 'active'
		});
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('[billing] Immediate cancellation snapshot for organization test-org will be reconciled'),
			expect.any(Error)
		);
		warnSpy.mockRestore();
	});
});
