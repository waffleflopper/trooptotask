import { describe, expect, it, vi } from 'vitest';
import {
	createSupabasePlatformBillingEvents,
	createSupabasePlatformBillingEventsStore
} from './supabasePlatformBillingEvents';

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

function makeRetryEventSupabase(row: unknown) {
	const webhookRetryAttempts: Array<{ name: string; args: Record<string, unknown> }> = [];
	const webhookUpdates: Array<{ values: Record<string, unknown>; filters: Array<[string, string, unknown]> }> = [];

	function webhookUpdate(values: Record<string, unknown>) {
		const filters: Array<[string, string, unknown]> = [];
		const chain = {
			eq: vi.fn((column: string, value: unknown) => {
				filters.push(['eq', column, value]);
				return chain;
			}),
			lt: vi.fn((column: string, value: unknown) => {
				filters.push(['lt', column, value]);
				return chain;
			}),
			not: vi.fn((column: string, operator: string, value: unknown) => {
				filters.push(['not', `${column}.${operator}`, value]);
				return chain;
			}),
			neq: vi.fn((column: string, value: unknown) => {
				filters.push(['neq', column, value]);
				webhookUpdates.push({ values, filters });
				return Promise.resolve({ error: null });
			}),
			then: (resolve: (value: { error: null }) => unknown, reject?: (reason: unknown) => unknown) => {
				webhookUpdates.push({ values, filters });
				return Promise.resolve({ error: null }).then(resolve, reject);
			}
		};
		return chain;
	}

	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		maybeSingle: vi.fn(async () => ({ data: row, error: null })),
		update: vi.fn(webhookUpdate)
	};
	const supabase = {
		rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
			if (name !== 'record_retryable_stripe_webhook_event_attempt') {
				throw new Error(`Unexpected rpc ${name}`);
			}
			webhookRetryAttempts.push({ name, args });
			return { data: 4, error: null };
		}),
		from: vi.fn((table: string) => {
			if (table !== 'stripe_webhook_events') {
				throw new Error(`Unexpected table ${table}`);
			}
			return query;
		})
	};

	return {
		supabase,
		query,
		webhookRetryAttempts,
		webhookUpdates
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

	it('recomputes legacy invoice metadata before recording admin retry attempts', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const row = {
			id: 'evt_invoice_retry',
			type: 'invoice.payment_failed',
			data: {
				object: {
					id: 'in_123',
					object: 'invoice',
					parent: {
						subscription_details: {
							subscription: 'sub_123'
						}
					},
					customer: 'cus_123'
				}
			},
			object_id: 'in_123',
			secondary_dedupe_key: 'invoice.payment_failed:in_123',
			event_created_at: '2026-05-23T00:00:00.000Z',
			processed: false,
			processed_at: null,
			processing_state: 'retryable_failed',
			attempt_count: 3,
			last_error: 'temporary error',
			processing_result: 'retryable processing failure',
			created_at: '2026-05-23T00:00:01.000Z',
			updated_at: '2026-05-23T00:00:02.000Z'
		};
		const { supabase, webhookRetryAttempts } = makeRetryEventSupabase(row);

		const result = await createSupabasePlatformBillingEvents({
			adminUser: { id: 'admin-1', role: 'billing' },
			adminClient: supabase as never,
			sessionClient: supabase as never,
			session: null,
			audit: vi.fn()
		}).retryEvent('evt_invoice_retry');

		expect(result).toMatchObject({
			ok: false,
			status: 500
		});
		expect(webhookRetryAttempts).toEqual([
			{
				name: 'record_retryable_stripe_webhook_event_attempt',
				args: expect.objectContaining({
					p_id: 'evt_invoice_retry',
					p_type: 'invoice.payment_failed',
					p_object_id: 'sub_123',
					p_secondary_dedupe_key: 'invoice.payment_failed:sub_123',
					p_event_created_at: '2026-05-23T00:00:00.000Z'
				})
			}
		]);
		expect(webhookRetryAttempts[0]?.args).not.toMatchObject({
			p_object_id: 'in_123',
			p_secondary_dedupe_key: 'invoice.payment_failed:in_123'
		});
		consoleError.mockRestore();
	});

	it('retries a retryable billing event through the platform billing retry processor', async () => {
		const row = {
			id: 'evt_retry',
			type: 'billing.test.unsupported',
			data: { object: { id: 'manual_object' } },
			object_id: 'manual_object',
			secondary_dedupe_key: 'billing.test.unsupported:manual_object',
			event_created_at: '2026-05-23T00:00:00.000Z',
			processed: false,
			processed_at: null,
			processing_state: 'retryable_failed',
			attempt_count: 3,
			last_error: 'temporary error',
			processing_result: 'retryable processing failure',
			created_at: '2026-05-23T00:00:01.000Z',
			updated_at: '2026-05-23T00:00:02.000Z'
		};
		const { supabase, webhookRetryAttempts, webhookUpdates } = makeRetryEventSupabase(row);
		const audit = vi.fn();

		const result = await createSupabasePlatformBillingEvents({
			adminUser: { id: 'admin-1', role: 'billing' },
			adminClient: supabase as never,
			sessionClient: supabase as never,
			session: null,
			audit
		}).retryEvent('evt_retry');

		expect(result).toEqual({
			ok: true,
			state: 'ignored',
			result: 'unsupported event type billing.test.unsupported'
		});
		expect(webhookRetryAttempts).toEqual([
			{
				name: 'record_retryable_stripe_webhook_event_attempt',
				args: expect.objectContaining({
					p_id: 'evt_retry',
					p_type: 'billing.test.unsupported',
					p_object_id: 'manual_object',
					p_secondary_dedupe_key: 'billing.test.unsupported:manual_object',
					p_event_created_at: '2026-05-23T00:00:00.000Z'
				})
			}
		]);
		expect(webhookUpdates).toEqual([
			{
				values: expect.objectContaining({
					processed: false,
					processed_at: null,
					processing_state: 'ignored',
					processing_result: 'unsupported event type billing.test.unsupported',
					last_error: null
				}),
				filters: [['eq', 'id', 'evt_retry']]
			}
		]);
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.billing_event.retry',
				resourceType: 'stripe_webhook_event',
				resourceId: 'evt_retry',
				severity: 'info',
				details: expect.objectContaining({
					eventType: 'billing.test.unsupported',
					objectId: 'manual_object',
					processingStateBefore: 'retryable_failed',
					attemptCountBefore: 3,
					resultState: 'ignored',
					result: 'unsupported event type billing.test.unsupported'
				})
			})
		);
	});
});
