import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminContext } from '$lib/server/adapters/adminAdapter';

const { recordAttemptMock, processRecordedMock } = vi.hoisted(() => ({
	recordAttemptMock: vi.fn(),
	processRecordedMock: vi.fn()
}));

vi.mock('$lib/server/billing/stripeWebhookProcessing', () => ({
	_recordRetryableStripeWebhookEventAttempt: recordAttemptMock,
	_processRecordedStripeWebhookEvent: processRecordedMock
}));

import { _mapBillingEventDiagnostics, _retryBillingEventCore } from './+page.server';

type QueryResponse = { data: unknown; error: unknown };

function createAdminClient(rowResponse: QueryResponse) {
	const filters: Array<[string, unknown]> = [];
	return {
		filters,
		from(table: string) {
			if (table !== 'stripe_webhook_events') throw new Error(`Unexpected table ${table}`);
			return {
				select: () => ({
					eq(column: string, value: unknown) {
						filters.push([column, value]);
						return {
							single: async () => rowResponse
						};
					}
				})
			};
		}
	};
}

function createAdminContext(adminClient: unknown): AdminContext {
	return {
		adminUser: { id: 'admin-1', role: 'billing' },
		adminClient: adminClient as never,
		sessionClient: adminClient as never,
		session: null,
		audit: vi.fn()
	};
}

describe('admin billing event diagnostics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		processRecordedMock.mockResolvedValue({
			ok: true,
			state: 'processed',
			result: 'checkout pending activation recorded',
			status: 200
		});
	});

	it('maps safe event metadata and links organizations without exposing payload data', () => {
		const diagnostics = _mapBillingEventDiagnostics(
			[
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
					updated_at: '2026-05-23T00:00:02.000Z',
					data: { object: { secret: 'not-for-admin-ui' } }
				}
			],
			[
				{
					organization_id: 'org-1',
					stripe_customer_id: 'cus_123',
					stripe_subscription_id: null,
					last_stripe_event_id: 'evt_123'
				}
			],
			[{ id: 'org-1', name: 'Alpha Company' }]
		);

		expect(diagnostics).toEqual([
			expect.objectContaining({
				id: 'evt_123',
				type: 'checkout.session.completed',
				objectId: 'cs_123',
				processingState: 'retryable_failed',
				attemptCount: 2,
				canRetry: true,
				organization: { id: 'org-1', name: 'Alpha Company' }
			})
		]);
		expect(diagnostics[0]).not.toHaveProperty('data');
	});

	it('records a new attempt and processes retryable failures through the shared webhook processor', async () => {
		const adminClient = createAdminClient({
			data: {
				id: 'evt_retry',
				type: 'checkout.session.completed',
				data: { object: { id: 'cs_123', metadata: { orgId: 'org-1', tier: 'team' }, subscription: 'sub_123' } },
				object_id: 'cs_123',
				secondary_dedupe_key: 'checkout.session.completed:cs_123',
				event_created_at: '2026-05-23T00:00:00.000Z',
				processed: false,
				processed_at: null,
				processing_state: 'retryable_failed',
				attempt_count: 3,
				last_error: 'temporary error',
				processing_result: 'retryable processing failure',
				created_at: '2026-05-23T00:00:01.000Z',
				updated_at: '2026-05-23T00:00:02.000Z'
			},
			error: null
		});
		const ctx = createAdminContext(adminClient);

		const result = await _retryBillingEventCore(ctx, 'evt_retry');

		expect(result).toEqual({ ok: true, state: 'processed', result: 'checkout pending activation recorded' });
		expect(recordAttemptMock).toHaveBeenCalledWith(
			adminClient,
			expect.objectContaining({ id: 'evt_retry', type: 'checkout.session.completed' }),
			expect.objectContaining({
				objectId: 'cs_123',
				secondaryDedupeKey: 'checkout.session.completed:cs_123',
				eventCreatedAt: '2026-05-23T00:00:00.000Z'
			})
		);
		expect(processRecordedMock).toHaveBeenCalledWith(
			adminClient,
			expect.objectContaining({ id: 'evt_retry', created: 1779494400 }),
			expect.objectContaining({
				secondaryDedupeKey: 'checkout.session.completed:cs_123',
				eventCreatedAt: '2026-05-23T00:00:00.000Z'
			})
		);
		expect(ctx.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.billing_event.retry',
				resourceType: 'stripe_webhook_event',
				resourceId: 'evt_retry',
				severity: 'info',
				details: expect.objectContaining({
					processingStateBefore: 'retryable_failed',
					attemptCountBefore: 3,
					resultState: 'processed'
				})
			})
		);
	});

	it('audits and returns a retry error when processing fails again', async () => {
		processRecordedMock.mockResolvedValue({
			ok: false,
			state: 'retryable_failed',
			result: 'retryable processing failure',
			status: 500,
			error: 'DB timeout'
		});
		const adminClient = createAdminClient({
			data: {
				id: 'evt_retry_again',
				type: 'checkout.session.completed',
				data: { object: { id: 'cs_123' } },
				object_id: 'cs_123',
				secondary_dedupe_key: 'checkout.session.completed:cs_123',
				event_created_at: '2026-05-23T00:00:00.000Z',
				processed: false,
				processed_at: null,
				processing_state: 'retryable_failed',
				attempt_count: 3,
				last_error: 'temporary error',
				processing_result: 'retryable processing failure',
				created_at: '2026-05-23T00:00:01.000Z',
				updated_at: '2026-05-23T00:00:02.000Z'
			},
			error: null
		});
		const ctx = createAdminContext(adminClient);

		const result = await _retryBillingEventCore(ctx, 'evt_retry_again');

		expect(result).toEqual({ ok: false, status: 500, error: 'DB timeout' });
		expect(ctx.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				severity: 'warning',
				details: expect.objectContaining({ resultState: 'retryable_failed', result: 'retryable processing failure' })
			})
		);
	});

	it('audits and returns permanent retry processing failures', async () => {
		processRecordedMock.mockResolvedValue({
			ok: false,
			state: 'permanently_failed',
			result: 'permanent processing failure',
			status: 200,
			error: 'missing required Stripe metadata'
		});
		const adminClient = createAdminClient({
			data: {
				id: 'evt_permanent_after_retry',
				type: 'checkout.session.completed',
				data: { object: { id: 'cs_123' } },
				object_id: 'cs_123',
				secondary_dedupe_key: 'checkout.session.completed:cs_123',
				event_created_at: '2026-05-23T00:00:00.000Z',
				processed: false,
				processed_at: null,
				processing_state: 'retryable_failed',
				attempt_count: 3,
				last_error: 'temporary error',
				processing_result: 'retryable processing failure',
				created_at: '2026-05-23T00:00:01.000Z',
				updated_at: '2026-05-23T00:00:02.000Z'
			},
			error: null
		});
		const ctx = createAdminContext(adminClient);

		const result = await _retryBillingEventCore(ctx, 'evt_permanent_after_retry');

		expect(result).toEqual({ ok: false, status: 400, error: 'missing required Stripe metadata' });
		expect(ctx.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				severity: 'warning',
				details: expect.objectContaining({ resultState: 'permanently_failed', result: 'permanent processing failure' })
			})
		);
	});

	it('audits and returns retry ledger recording failures', async () => {
		recordAttemptMock.mockRejectedValue(new Error('billing event is no longer retryable'));
		const adminClient = createAdminClient({
			data: {
				id: 'evt_race',
				type: 'checkout.session.completed',
				data: { object: { id: 'cs_123' } },
				object_id: 'cs_123',
				secondary_dedupe_key: 'checkout.session.completed:cs_123',
				event_created_at: '2026-05-23T00:00:00.000Z',
				processed: false,
				processed_at: null,
				processing_state: 'retryable_failed',
				attempt_count: 3,
				last_error: 'temporary error',
				processing_result: 'retryable processing failure',
				created_at: '2026-05-23T00:00:01.000Z',
				updated_at: '2026-05-23T00:00:02.000Z'
			},
			error: null
		});
		const ctx = createAdminContext(adminClient);

		const result = await _retryBillingEventCore(ctx, 'evt_race');

		expect(result).toEqual({ ok: false, status: 409, error: 'billing event is no longer retryable' });
		expect(processRecordedMock).not.toHaveBeenCalled();
		expect(ctx.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				severity: 'warning',
				details: expect.objectContaining({
					resultState: 'ledger_error',
					result: 'billing event is no longer retryable'
				})
			})
		);
	});

	it.each(['processed', 'ignored', 'permanently_failed', 'superseded'])(
		'denies retries for %s events',
		async (processingState) => {
			const adminClient = createAdminClient({
				data: {
					id: `evt_${processingState}`,
					type: 'customer.created',
					data: { object: { id: 'cus_123' } },
					object_id: 'cus_123',
					secondary_dedupe_key: `customer.created:cus_123`,
					event_created_at: '2026-05-23T00:00:00.000Z',
					processed: processingState === 'processed',
					processed_at: null,
					processing_state: processingState,
					attempt_count: 1,
					last_error: null,
					processing_result: processingState,
					created_at: '2026-05-23T00:00:01.000Z',
					updated_at: '2026-05-23T00:00:02.000Z'
				},
				error: null
			});

			const result = await _retryBillingEventCore(createAdminContext(adminClient), `evt_${processingState}`);

			expect(result).toEqual({
				ok: false,
				status: 400,
				error: `${processingState} billing events cannot be retried.`
			});
			expect(recordAttemptMock).not.toHaveBeenCalled();
			expect(processRecordedMock).not.toHaveBeenCalled();
		}
	);
});
