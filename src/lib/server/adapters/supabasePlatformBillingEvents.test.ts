import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformBillingEventsStore } from './supabasePlatformBillingEvents';

function makeRecentEventsSupabase(rows: unknown[], error: unknown = null) {
	const query = {
		select: vi.fn(() => query),
		order: vi.fn(() => query),
		limit: vi.fn(async () => ({ data: rows, error }))
	};
	return {
		query,
		supabase: {
			from: vi.fn(() => query)
		}
	};
}

function makeEventByIdSupabase(row: unknown, error: unknown = null) {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		maybeSingle: vi.fn(async () => ({ data: row, error }))
	};
	return {
		query,
		supabase: {
			from: vi.fn(() => query)
		}
	};
}

describe('Supabase PlatformBillingEvents adapter', () => {
	it('reads recent billing events as platform billing event records', async () => {
		const { supabase, query } = makeRecentEventsSupabase([
			{
				id: 'evt_123',
				type: 'checkout.session.completed',
				object_id: 'cs_123',
				secondary_dedupe_key: 'checkout.session.completed:cs_123',
				event_created_at: '2026-05-23T00:00:00.000Z',
				processed: false,
				processed_at: null,
				processing_state: 'retryable_failed',
				attempt_count: 2,
				last_error: 'temporary database error',
				processing_result: 'retryable processing failure',
				created_at: '2026-05-23T00:00:01.000Z',
				updated_at: '2026-05-23T00:00:02.000Z'
			}
		]);

		const result = await createSupabasePlatformBillingEventsStore(supabase as never).listRecentEvents(50);

		expect(result).toEqual([
			expect.objectContaining({
				id: 'evt_123',
				objectId: 'cs_123',
				secondaryDedupeKey: 'checkout.session.completed:cs_123',
				processingState: 'retryable_failed',
				attemptCount: 2
			})
		]);
		expect(supabase.from).toHaveBeenCalledWith('stripe_webhook_events');
		expect(query.limit).toHaveBeenCalledWith(50);
	});

	it('reads a single billing event by id and returns null when it is missing', async () => {
		const { supabase, query } = makeEventByIdSupabase(null);

		await expect(
			createSupabasePlatformBillingEventsStore(supabase as never).getEventById('missing')
		).resolves.toBeNull();
		expect(query.eq).toHaveBeenCalledWith('id', 'missing');
	});

	it('surfaces recent event provider failures', async () => {
		const { supabase } = makeRecentEventsSupabase([], { message: 'database offline', code: 'XX000' });

		await expect(createSupabasePlatformBillingEventsStore(supabase as never).listRecentEvents(50)).rejects.toThrow(
			'table stripe_webhook_events recent events failed: database offline (XX000)'
		);
	});

	it('partitions Stripe object identifiers before linking billing snapshots', async () => {
		const query = {
			select: vi.fn(() => query),
			or: vi.fn(async () => ({ data: [], error: null }))
		};
		const supabase = {
			from: vi.fn(() => query)
		};

		await expect(
			createSupabasePlatformBillingEventsStore(supabase as never).listSnapshotsForEvents({
				eventIds: ['evt_123'],
				objectIds: ['cus_123', 'sub_123', 'manual_object']
			})
		).resolves.toEqual([]);

		expect(supabase.from).toHaveBeenCalledWith('organization_billing_snapshots');
		expect(query.or).toHaveBeenCalledWith(
			'last_stripe_event_id.in.(evt_123),stripe_subscription_id.in.(sub_123,manual_object),stripe_customer_id.in.(cus_123,manual_object)'
		);
	});
});
