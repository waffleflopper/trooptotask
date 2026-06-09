import { describe, expect, it, vi } from 'vitest';
import { createInMemoryPlatformBillingEventsStore } from '$lib/server/adapters/inMemoryPlatformBillingEvents';
import { createPlatformBillingEvents, type PlatformBillingEventsStore } from './platformBillingEvents';

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
});
