import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminContext } from '$lib/server/adapters/adminAdapter';
import type { PlatformBillingEventRecord } from '$lib/server/core/useCases/platformBillingEvents';
import { mapBillingEventDiagnostics } from '$lib/server/core/useCases/platformBillingEvents';

const { recordAttemptMock, processRecordedMock, platformBillingEventsMock, createPlatformBillingEventsMock } =
	vi.hoisted(() => {
		const billingEvents = {
			listDiagnostics: vi.fn(),
			getEventById: vi.fn()
		};

		return {
			recordAttemptMock: vi.fn(),
			processRecordedMock: vi.fn(),
			platformBillingEventsMock: billingEvents,
			createPlatformBillingEventsMock: vi.fn(() => billingEvents)
		};
	});

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event),
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformBillingEvents', () => ({
	createSupabasePlatformBillingEvents: createPlatformBillingEventsMock
}));

const retryEventDefaults: PlatformBillingEventRecord = {
	id: 'evt_retry',
	type: 'checkout.session.completed',
	data: { object: { id: 'cs_123', metadata: { orgId: 'org-1', tier: 'team' }, subscription: 'sub_123' } },
	objectId: 'cs_123',
	secondaryDedupeKey: 'checkout.session.completed:cs_123',
	eventCreatedAt: '2026-05-23T00:00:00.000Z',
	processed: false,
	processedAt: null,
	processingState: 'retryable_failed',
	attemptCount: 3,
	lastError: 'temporary error',
	processingResult: 'retryable processing failure',
	createdAt: '2026-05-23T00:00:01.000Z',
	updatedAt: '2026-05-23T00:00:02.000Z'
};

function makeRetryEvent(overrides: Partial<PlatformBillingEventRecord> = {}): PlatformBillingEventRecord {
	return { ...retryEventDefaults, ...overrides };
}

function mapLegacyRow(row: Record<string, unknown>): PlatformBillingEventRecord {
	return makeRetryEvent({
		id: row.id as string,
		type: row.type as string,
		data: row.data as PlatformBillingEventRecord['data'],
		objectId: row.object_id as string | null,
		secondaryDedupeKey: row.secondary_dedupe_key as string | null,
		eventCreatedAt: row.event_created_at as string | null,
		processed: row.processed as boolean | null,
		processedAt: row.processed_at as string | null,
		processingState: row.processing_state as PlatformBillingEventRecord['processingState'],
		attemptCount: row.attempt_count as number | null,
		lastError: row.last_error as string | null,
		processingResult: row.processing_result as string | null,
		createdAt: row.created_at as string | null,
		updatedAt: row.updated_at as string | null
	});
}

vi.mock('$lib/server/billing/stripeWebhookProcessing', () => ({
	_recordRetryableStripeWebhookEventAttempt: recordAttemptMock,
	_processRecordedStripeWebhookEvent: processRecordedMock
}));

import { _retryBillingEventCore, load } from './+page.server';

type QueryResponse = { data: unknown; error: unknown };

function createAdminClient(rowResponse: QueryResponse) {
	const filters: Array<[string, unknown]> = [];
	if (rowResponse.error) {
		platformBillingEventsMock.getEventById.mockRejectedValueOnce(rowResponse.error);
	} else {
		platformBillingEventsMock.getEventById.mockResolvedValueOnce(
			rowResponse.data ? mapLegacyRow(rowResponse.data as Record<string, unknown>) : null
		);
	}
	return {
		filters,
		from(table: string) {
			throw new Error(`Unexpected route-level provider read from ${table}`);
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
		platformBillingEventsMock.listDiagnostics.mockResolvedValue({
			events: [],
			diagnosticsError: false
		});
		processRecordedMock.mockResolvedValue({
			ok: true,
			state: 'processed',
			result: 'checkout pending activation recorded',
			status: 200
		});
	});

	it('maps safe event metadata and links organizations without exposing payload data', () => {
		const diagnostics = mapBillingEventDiagnostics(
			[
				{
					id: 'evt_123',
					type: 'checkout.session.completed',
					objectId: 'cs_123',
					secondaryDedupeKey: 'checkout.session.completed:cs_123',
					eventCreatedAt: '2026-05-23T00:00:00.000Z',
					processed: false,
					processedAt: null,
					processingState: 'retryable_failed',
					attemptCount: 2,
					lastError: 'temporary database error',
					processingResult: 'retryable processing failure',
					createdAt: '2026-05-23T00:00:01.000Z',
					updatedAt: '2026-05-23T00:00:02.000Z',
					data: { object: { secret: 'not-for-admin-ui' } }
				}
			],
			[
				{
					organizationId: 'org-1',
					stripeCustomerId: 'cus_123',
					stripeSubscriptionId: null,
					lastStripeEventId: 'evt_123'
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

	it('loads billing event diagnostics through the platform billing-events seam', async () => {
		platformBillingEventsMock.listDiagnostics.mockResolvedValueOnce({
			events: [
				{
					id: 'evt_123',
					type: 'checkout.session.completed',
					objectId: 'cs_123',
					secondaryDedupeKey: 'checkout.session.completed:cs_123',
					eventCreatedAt: '2026-05-23T00:00:00.000Z',
					processed: false,
					processedAt: null,
					processingState: 'retryable_failed',
					attemptCount: 2,
					lastError: 'temporary database error',
					processingResult: 'retryable processing failure',
					createdAt: '2026-05-23T00:00:01.000Z',
					updatedAt: '2026-05-23T00:00:02.000Z',
					canRetry: true,
					organization: { id: 'org-1', name: 'Alpha Company' }
				}
			],
			diagnosticsError: false
		});
		const ctx = createAdminContext({
			from: vi.fn((table: string) => {
				throw new Error(`route must use PlatformBillingEvents instead of ${table}`);
			})
		});

		const result = await load({ __ctx: ctx } as unknown as Parameters<typeof load>[0]);

		expect(createPlatformBillingEventsMock).toHaveBeenCalledWith(ctx);
		expect(platformBillingEventsMock.listDiagnostics).toHaveBeenCalledWith({ limit: 50 });
		expect(result).toEqual({
			events: [
				expect.objectContaining({
					id: 'evt_123',
					organization: { id: 'org-1', name: 'Alpha Company' },
					canRetry: true
				})
			],
			diagnosticsError: false
		});
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

	it('returns a server error when retry event lookup fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const adminClient = createAdminClient({
			data: null,
			error: new Error('database offline')
		});

		const result = await _retryBillingEventCore(createAdminContext(adminClient), 'evt_lookup_error');

		expect(result).toEqual({ ok: false, status: 500, error: 'Failed to fetch billing event.' });
		expect(consoleError).toHaveBeenCalledWith(
			'Admin billing event lookup failed:',
			expect.objectContaining({ eventId: 'evt_lookup_error', err: expect.any(Error) })
		);
		expect(recordAttemptMock).not.toHaveBeenCalled();
		expect(processRecordedMock).not.toHaveBeenCalled();
		consoleError.mockRestore();
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
