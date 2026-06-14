import { describe, expect, it, vi } from 'vitest';
import { createInMemoryPlatformBillingEventsStore } from '$lib/server/adapters/inMemoryPlatformBillingEvents';
import {
	createPlatformBillingEvents,
	type PlatformBillingEventRecord,
	type PlatformBillingEventRetryProcessor,
	type PlatformBillingEventsStore
} from './platformBillingEvents';

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

function createRetryProcessor(
	overrides: Partial<PlatformBillingEventRetryProcessor> = {}
): PlatformBillingEventRetryProcessor {
	return {
		recordRetryAttempt: vi.fn(async () => 4),
		processRecordedEvent: vi.fn(async () => ({
			ok: true,
			state: 'processed' as const,
			result: 'checkout pending activation recorded',
			status: 200
		})),
		...overrides
	};
}

describe('PlatformBillingEvents', () => {
	it('lists safe billing event diagnostics linked to organizations through billing snapshots', async () => {
		const billingEvents = createPlatformBillingEvents({
			store: createInMemoryPlatformBillingEventsStore({
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
						data: { object: { secret: 'not-for-admin-ui' } }
					}
				],
				snapshots: [
					{
						organizationId: 'org-1',
						stripeCustomerId: 'cus_123',
						stripeSubscriptionId: null,
						lastStripeEventId: 'evt_123'
					}
				],
				organizations: [{ id: 'org-1', name: 'Alpha Company' }]
			})
		});

		const result = await billingEvents.listDiagnostics({ limit: 50 });

		expect(result).toEqual({
			events: [
				expect.objectContaining({
					id: 'evt_123',
					type: 'checkout.session.completed',
					objectId: 'cs_123',
					processingState: 'retryable_failed',
					attemptCount: 2,
					canRetry: true,
					organization: { id: 'org-1', name: 'Alpha Company' }
				})
			],
			diagnosticsError: false
		});
		expect(result.events[0]).not.toHaveProperty('data');
	});

	it('reads a single billing event by id and returns null for missing events', async () => {
		const billingEvents = createPlatformBillingEvents({
			store: createInMemoryPlatformBillingEventsStore({
				events: [
					{
						id: 'evt_found',
						type: 'customer.subscription.updated',
						objectId: 'sub_123',
						secondaryDedupeKey: 'customer.subscription.updated:sub_123',
						eventCreatedAt: '2026-05-24T00:00:00.000Z',
						processed: true,
						processedAt: '2026-05-24T00:00:03.000Z',
						processingState: 'processed',
						attemptCount: 1,
						lastError: null,
						processingResult: 'subscription snapshot updated',
						createdAt: '2026-05-24T00:00:01.000Z',
						updatedAt: '2026-05-24T00:00:03.000Z',
						data: { object: { id: 'sub_123' } }
					}
				]
			})
		});

		await expect(billingEvents.getEventById('evt_found')).resolves.toMatchObject({
			id: 'evt_found',
			type: 'customer.subscription.updated',
			data: { object: { id: 'sub_123' } }
		});
		await expect(billingEvents.getEventById('missing')).resolves.toBeNull();
	});

	it('links snapshots by Stripe object id and keeps missing organization names nullable', async () => {
		const billingEvents = createPlatformBillingEvents({
			store: createInMemoryPlatformBillingEventsStore({
				events: [
					{
						id: 'evt_without_snapshot_event_id',
						type: 'customer.subscription.updated',
						objectId: 'sub_123',
						secondaryDedupeKey: 'customer.subscription.updated:sub_123',
						eventCreatedAt: '2026-05-24T00:00:00.000Z',
						processed: true,
						processedAt: '2026-05-24T00:00:03.000Z',
						processingState: 'processed',
						attemptCount: null,
						lastError: null,
						processingResult: 'subscription snapshot updated',
						createdAt: '2026-05-24T00:00:01.000Z',
						updatedAt: '2026-05-24T00:00:03.000Z'
					},
					{
						id: 'evt_without_snapshot',
						type: 'customer.created',
						objectId: 'cus_missing',
						secondaryDedupeKey: 'customer.created:cus_missing',
						eventCreatedAt: '2026-05-23T00:00:00.000Z',
						processed: false,
						processedAt: null,
						processingState: 'retryable_failed',
						attemptCount: null,
						lastError: 'temporary error',
						processingResult: 'retryable processing failure',
						createdAt: '2026-05-23T00:00:01.000Z',
						updatedAt: '2026-05-23T00:00:02.000Z'
					}
				],
				snapshots: [
					{
						organizationId: 'org-without-name',
						stripeCustomerId: null,
						stripeSubscriptionId: 'sub_123',
						lastStripeEventId: null
					}
				]
			})
		});

		const result = await billingEvents.listDiagnostics({ limit: 50 });

		expect(result).toEqual({
			events: [
				expect.objectContaining({
					id: 'evt_without_snapshot_event_id',
					attemptCount: 0,
					canRetry: false,
					organization: { id: 'org-without-name', name: null }
				}),
				expect.objectContaining({
					id: 'evt_without_snapshot',
					attemptCount: 0,
					canRetry: true,
					organization: null
				})
			],
			diagnosticsError: false
		});
	});

	it('returns partial diagnostics when snapshot links cannot be loaded', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const store: PlatformBillingEventsStore = {
			...createInMemoryPlatformBillingEventsStore({
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
						updatedAt: '2026-05-23T00:00:02.000Z'
					}
				]
			}),
			async listSnapshotsForEvents() {
				throw new Error('snapshot link query failed');
			}
		};
		const billingEvents = createPlatformBillingEvents({ store });

		const result = await billingEvents.listDiagnostics({ limit: 50 });

		expect(result).toEqual({
			events: [expect.objectContaining({ id: 'evt_123', organization: null })],
			diagnosticsError: true
		});
		expect(consoleError).toHaveBeenCalledWith('Admin billing event snapshot-link query failed:', expect.any(Error));
		consoleError.mockRestore();
	});

	it('returns partial diagnostics when organization names cannot be loaded', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const store: PlatformBillingEventsStore = {
			...createInMemoryPlatformBillingEventsStore({
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
						updatedAt: '2026-05-23T00:00:02.000Z'
					}
				],
				snapshots: [
					{
						organizationId: 'org-1',
						stripeCustomerId: null,
						stripeSubscriptionId: null,
						lastStripeEventId: 'evt_123'
					}
				]
			}),
			async listOrganizationsById() {
				throw new Error('organization link query failed');
			}
		};
		const billingEvents = createPlatformBillingEvents({ store });

		const result = await billingEvents.listDiagnostics({ limit: 50 });

		expect(result).toEqual({
			events: [expect.objectContaining({ id: 'evt_123', organization: { id: 'org-1', name: null } })],
			diagnosticsError: true
		});
		expect(consoleError).toHaveBeenCalledWith('Admin billing event organization-link query failed:', expect.any(Error));
		consoleError.mockRestore();
	});

	it('successfully retries a retryable event and records an info audit event', async () => {
		const audit = vi.fn();
		const retryProcessor = createRetryProcessor();
		const billingEvents = createPlatformBillingEvents({
			store: createInMemoryPlatformBillingEventsStore({ events: [makeRetryEvent()] }),
			retryProcessor,
			audit
		});

		const result = await billingEvents.retryEvent(' evt_retry ');

		expect(result).toEqual({ ok: true, state: 'processed', result: 'checkout pending activation recorded' });
		expect(retryProcessor.recordRetryAttempt).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'evt_retry', type: 'checkout.session.completed' }),
			expect.objectContaining({
				objectId: 'cs_123',
				secondaryDedupeKey: 'checkout.session.completed:cs_123',
				eventCreatedAt: '2026-05-23T00:00:00.000Z'
			})
		);
		expect(retryProcessor.processRecordedEvent).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'evt_retry', created: 1779494400 }),
			expect.objectContaining({
				secondaryDedupeKey: 'checkout.session.completed:cs_123',
				eventCreatedAt: '2026-05-23T00:00:00.000Z'
			})
		);
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.billing_event.retry',
				resourceType: 'stripe_webhook_event',
				resourceId: 'evt_retry',
				severity: 'info',
				details: expect.objectContaining({
					eventType: 'checkout.session.completed',
					objectId: 'cs_123',
					processingStateBefore: 'retryable_failed',
					attemptCountBefore: 3,
					resultState: 'processed',
					result: 'checkout pending activation recorded'
				})
			})
		);
	});

	it('audits processing failures with warning severity and preserves status mapping', async () => {
		const audit = vi.fn();
		const retryProcessor = createRetryProcessor({
			processRecordedEvent: vi.fn(async () => ({
				ok: false,
				state: 'permanently_failed' as const,
				result: 'permanent processing failure',
				status: 200,
				error: 'missing required Stripe metadata'
			}))
		});
		const billingEvents = createPlatformBillingEvents({
			store: createInMemoryPlatformBillingEventsStore({ events: [makeRetryEvent({ id: 'evt_permanent' })] }),
			retryProcessor,
			audit
		});

		const result = await billingEvents.retryEvent('evt_permanent');

		expect(result).toEqual({ ok: false, status: 400, error: 'missing required Stripe metadata' });
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				severity: 'warning',
				details: expect.objectContaining({
					resultState: 'permanently_failed',
					result: 'permanent processing failure'
				})
			})
		);
	});

	it('audits retry-attempt races as ledger errors and returns conflict', async () => {
		const audit = vi.fn();
		const retryProcessor = createRetryProcessor({
			recordRetryAttempt: vi.fn(async () => {
				throw new Error('billing event is no longer retryable');
			})
		});
		const billingEvents = createPlatformBillingEvents({
			store: createInMemoryPlatformBillingEventsStore({ events: [makeRetryEvent({ id: 'evt_race' })] }),
			retryProcessor,
			audit
		});

		const result = await billingEvents.retryEvent('evt_race');

		expect(result).toEqual({ ok: false, status: 409, error: 'billing event is no longer retryable' });
		expect(retryProcessor.processRecordedEvent).not.toHaveBeenCalled();
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				severity: 'warning',
				details: expect.objectContaining({
					resultState: 'ledger_error',
					result: 'billing event is no longer retryable'
				})
			})
		);
	});

	it('returns a sanitized server error and logs provider lookup failures', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const retryProcessor = createRetryProcessor();
		const store: PlatformBillingEventsStore = {
			...createInMemoryPlatformBillingEventsStore(),
			async getEventById() {
				throw new Error('provider database offline with internal detail');
			}
		};
		const billingEvents = createPlatformBillingEvents({ store, retryProcessor, audit: vi.fn() });

		const result = await billingEvents.retryEvent('evt_lookup_error');

		expect(result).toEqual({ ok: false, status: 500, error: 'Failed to fetch billing event.' });
		expect(consoleError).toHaveBeenCalledWith(
			'Admin billing event lookup failed:',
			expect.objectContaining({ eventId: 'evt_lookup_error', err: expect.any(Error) })
		);
		expect(retryProcessor.recordRetryAttempt).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it.each(['processed', 'ignored', 'permanently_failed', 'superseded'])(
		'denies retries for %s events without calling the retry processor',
		async (processingState) => {
			const audit = vi.fn();
			const retryProcessor = createRetryProcessor();
			const billingEvents = createPlatformBillingEvents({
				store: createInMemoryPlatformBillingEventsStore({
					events: [
						makeRetryEvent({
							id: `evt_${processingState}`,
							type: 'customer.created',
							objectId: 'cus_123',
							secondaryDedupeKey: `customer.created:cus_123`,
							processed: processingState === 'processed',
							processingState: processingState as PlatformBillingEventRecord['processingState']
						})
					]
				}),
				retryProcessor,
				audit
			});

			const result = await billingEvents.retryEvent(`evt_${processingState}`);

			expect(result).toEqual({
				ok: false,
				status: 400,
				error: `${processingState} billing events cannot be retried.`
			});
			expect(retryProcessor.recordRetryAttempt).not.toHaveBeenCalled();
			expect(retryProcessor.processRecordedEvent).not.toHaveBeenCalled();
			expect(audit).not.toHaveBeenCalled();
		}
	);

	it('reconstructs Stripe events with id, type, created timestamp, and data payload', async () => {
		const retryProcessor = createRetryProcessor();
		const billingEvents = createPlatformBillingEvents({
			store: createInMemoryPlatformBillingEventsStore({
				events: [
					makeRetryEvent({
						id: 'evt_reconstruct',
						type: 'customer.subscription.updated',
						data: { object: { id: 'sub_123', metadata: { orgId: 'org-1' } } },
						objectId: 'sub_123',
						secondaryDedupeKey: 'customer.subscription.updated:sub_123',
						eventCreatedAt: '2026-05-24T12:34:56.000Z'
					})
				]
			}),
			retryProcessor,
			audit: vi.fn()
		});

		await billingEvents.retryEvent('evt_reconstruct');

		expect(retryProcessor.recordRetryAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'evt_reconstruct',
				type: 'customer.subscription.updated',
				created: 1779626096,
				data: { object: { id: 'sub_123', metadata: { orgId: 'org-1' } } }
			}),
			expect.any(Object)
		);
	});
});
