import { describe, expect, it, vi } from 'vitest';
import { createSupabaseBillingSnapshotTransitionStore } from './supabaseBillingSnapshotTransitions';
import type { BillingSnapshotUpsert } from '$lib/server/core/useCases/billingSnapshotTransitions';

const snapshot = {
	organization_id: '00000000-0000-0000-0000-000000000001',
	source: 'stripe',
	commercial_plan: 'team',
	stripe_customer_id: 'cus_123',
	stripe_subscription_id: 'sub_123',
	stripe_product_id: 'prod_team',
	stripe_price_id: 'price_team',
	subscription_status: 'active',
	collection_status: 'current',
	current_period_start: '2026-05-01T00:00:00.000Z',
	current_period_end: '2026-06-01T00:00:00.000Z',
	cancel_at_period_end: false,
	canceled_at: null,
	cancellation_reason: null,
	cancellation_feedback: null,
	trial_end: null,
	sync_status: 'synced',
	last_stripe_event_id: 'evt_123',
	last_stripe_event_type: 'customer.subscription.updated',
	last_stripe_event_created_at: '2026-05-25T17:00:00.000Z',
	last_processed_at: '2026-05-25T17:01:00.000Z',
	drift_detected: false
} satisfies BillingSnapshotUpsert;

const mirror = {
	tier: 'team',
	stripe_customer_id: 'cus_123',
	stripe_subscription_id: 'sub_123',
	subscription_status: 'active',
	current_period_end: '2026-06-01T00:00:00.000Z'
};

function createSupabaseStub(result: { data: boolean | null; error: { message: string } | null }) {
	const rpc = vi.fn().mockResolvedValue(result);
	const from = vi.fn(() => {
		throw new Error('unexpected direct table update');
	});

	return {
		supabase: { rpc, from },
		rpc,
		from
	};
}

describe('createSupabaseBillingSnapshotTransitionStore', () => {
	it('writes snapshot and mirror through the combined RPC', async () => {
		const stub = createSupabaseStub({ data: true, error: null });
		const store = createSupabaseBillingSnapshotTransitionStore(stub.supabase as never);

		await expect(
			store.writeSnapshotAndMirrorIfCurrent({
				snapshot,
				mirror,
				eventPosition: {
					eventId: 'evt_123',
					eventType: 'customer.subscription.updated',
					eventCreatedAt: '2026-05-25T17:00:00.000Z'
				}
			})
		).resolves.toBe(true);

		expect(stub.rpc).toHaveBeenCalledWith('upsert_organization_billing_snapshot_and_mirror_if_current', {
			p_snapshot: snapshot,
			p_mirror: mirror
		});
		expect(stub.from).not.toHaveBeenCalled();
	});

	it.each([
		{ rpcResult: true, expected: true },
		{ rpcResult: false, expected: false },
		{ rpcResult: null, expected: false }
	])('returns $expected when the combined RPC returns $rpcResult', async ({ rpcResult, expected }) => {
		const stub = createSupabaseStub({ data: rpcResult, error: null });
		const store = createSupabaseBillingSnapshotTransitionStore(stub.supabase as never);

		await expect(store.writeSnapshotAndMirrorIfCurrent({ snapshot, mirror })).resolves.toBe(expected);
	});

	it('throws a sanitized adapter error when the combined RPC fails', async () => {
		const stub = createSupabaseStub({ data: null, error: { message: 'permission denied' } });
		const store = createSupabaseBillingSnapshotTransitionStore(stub.supabase as never);

		await expect(store.writeSnapshotAndMirrorIfCurrent({ snapshot, mirror })).rejects.toThrow(
			'Failed to update billing snapshot and mirror: permission denied'
		);
		expect(stub.from).not.toHaveBeenCalled();
	});
});
