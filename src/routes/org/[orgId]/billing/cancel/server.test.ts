import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';

const { buildRouteContextMock, getAdminClientMock, snapshotUpserts, orgMirrorUpdates } = vi.hoisted(() => ({
	buildRouteContextMock: vi.fn(),
	getAdminClientMock: vi.fn(),
	snapshotUpserts: [] as Array<{ values: Record<string, unknown>; options: Record<string, unknown> }>,
	orgMirrorUpdates: [] as Array<{ values: Record<string, unknown>; column: string; value: unknown }>
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

function createSnapshotAdminClient(
	input: {
		failOrganizationUpdate?: string;
		snapshot?: Record<string, unknown> | null;
	} = {}
) {
	const snapshot =
		'snapshot' in input
			? input.snapshot
			: {
					stripe_subscription_id: 'sub_123',
					last_stripe_event_id: 'evt_123',
					last_stripe_event_type: 'customer.subscription.updated',
					last_stripe_event_created_at: '2026-05-24T12:00:00.000Z'
				};

	return {
		rpc: async (functionName: string, params: Record<string, unknown>) => {
			if (functionName !== 'upsert_organization_billing_snapshot_if_current') {
				throw new Error(`unexpected rpc ${functionName}`);
			}
			snapshotUpserts.push({
				values: params.p_snapshot as Record<string, unknown>,
				options: { onConflict: 'organization_id' }
			});
			return { data: true, error: null };
		},
		from: (table: string) => {
			if (table === 'organization_billing_snapshots') {
				return {
					select: () => ({
						eq: () => ({
							single: async () => ({
								data: snapshot,
								error: null
							})
						})
					}),
					upsert: async (values: Record<string, unknown>, options: Record<string, unknown>) => {
						snapshotUpserts.push({ values, options });
						return { error: null };
					}
				};
			}
			if (table === 'organizations') {
				return {
					update: (values: Record<string, unknown>) => ({
						eq: async (column: string, value: unknown) => {
							orgMirrorUpdates.push({ values, column, value });
							return {
								error: input.failOrganizationUpdate ? { message: input.failOrganizationUpdate } : null
							};
						}
					})
				};
			}
			throw new Error(`unexpected table ${table}`);
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
		orgMirrorUpdates.length = 0;
		getAdminClientMock.mockReturnValue(createSnapshotAdminClient());
	});

	it('cancels the subscription and records pending cancellation through the app-owned store', async () => {
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
		expect(snapshotUpserts).toEqual([
			{
				values: expect.objectContaining({
					organization_id: ctx.auth.orgId,
					commercial_plan: 'free',
					stripe_customer_id: 'cus_123',
					stripe_subscription_id: 'sub_123',
					subscription_status: 'canceled',
					sync_status: 'pending',
					cancellation_feedback: 'too_expensive',
					last_stripe_event_id: 'evt_123',
					last_stripe_event_type: 'customer.subscription.updated',
					last_stripe_event_created_at: '2026-05-24T12:00:00.000Z',
					reconciliation_result: 'local_immediate_cancellation_pending_webhook'
				}),
				options: { onConflict: 'organization_id' }
			}
		]);
		expect(orgMirrorUpdates).toEqual([
			{
				values: {
					tier: 'free',
					subscription_status: null,
					stripe_subscription_id: 'sub_123',
					current_period_end: null
				},
				column: 'id',
				value: ctx.auth.orgId
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
		expect(snapshotUpserts).toEqual([]);
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
		getAdminClientMock.mockReturnValue(createSnapshotAdminClient({ failOrganizationUpdate: 'mirror denied' }));
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
