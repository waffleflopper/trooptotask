import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';

const { buildRouteContextMock, getAdminClientMock, snapshotUpserts } = vi.hoisted(() => ({
	buildRouteContextMock: vi.fn(),
	getAdminClientMock: vi.fn(),
	snapshotUpserts: [] as Array<{ values: Record<string, unknown>; options: Record<string, unknown> }>
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

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: getAdminClientMock
}));

import { POST } from './+server';

function createSnapshotAdminClient() {
	return {
		from: (table: string) => {
			if (table !== 'organization_billing_snapshots') {
				throw new Error(`unexpected table ${table}`);
			}
			return {
				upsert: async (values: Record<string, unknown>, options: Record<string, unknown>) => {
					snapshotUpserts.push({ values, options });
					return { error: null };
				}
			};
		}
	};
}

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
		snapshotUpserts.length = 0;
		getAdminClientMock.mockReturnValue(createSnapshotAdminClient());
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

		const response = await POST(cancelEvent(ctx, { cancellationFeedback: 'too_expensive' }));

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, snapshotCancellationApplied: true });
		expect(ctx.billingPort.calls).toContainEqual({
			method: 'cancelSubscription',
			args: ['sub_123', { cancellationFeedback: 'too_expensive' }]
		});
		expect(saved).toMatchObject({
			tier: 'free',
			stripe_customer_id: 'cus_123',
			stripe_subscription_id: null,
			subscription_status: null,
			current_period_end: null
		});
		expect(snapshotUpserts).toEqual([
			{
				values: expect.objectContaining({
					organization_id: ctx.auth.orgId,
					commercial_plan: 'free',
					stripe_customer_id: 'cus_123',
					stripe_subscription_id: null,
					subscription_status: 'canceled',
					sync_status: 'pending',
					cancellation_feedback: 'too_expensive',
					reconciliation_result: 'local_immediate_cancellation_pending_webhook'
				}),
				options: { onConflict: 'organization_id' }
			}
		]);
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

		const response = await POST(cancelEvent(ctx));

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, snapshotCancellationApplied: true });
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
			expect.stringContaining('[billing] Local cancellation state for organization test-org will be reconciled'),
			expect.any(Error)
		);
		warnSpy.mockRestore();
	});
});
