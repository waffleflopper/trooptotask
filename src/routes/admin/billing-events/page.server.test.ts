import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminContext } from '$lib/server/adapters/adminAdapter';

const {
	platformBillingEventsMock,
	createPlatformBillingEventsMock,
	platformBillingHealthMock,
	createPlatformBillingHealthMock
} = vi.hoisted(() => {
	const billingEvents = {
		listDiagnostics: vi.fn(),
		retryEvent: vi.fn()
	};
	const billingHealth = {
		summarize: vi.fn()
	};

	return {
		platformBillingEventsMock: billingEvents,
		createPlatformBillingEventsMock: vi.fn(() => billingEvents),
		platformBillingHealthMock: billingHealth,
		createPlatformBillingHealthMock: vi.fn(() => billingHealth)
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

vi.mock('$lib/server/adapters/supabasePlatformBillingHealth', () => ({
	createSupabasePlatformBillingHealth: createPlatformBillingHealthMock
}));

import { actions, load } from './+page.server';

function createAdminContext(): AdminContext {
	const throwingAdminClient = {
		from(table: string) {
			throw new Error(`Unexpected route-level provider read from ${table}`);
		},
		auth: {
			admin: {
				getUserById(userId: string) {
					throw new Error(`Unexpected route-level auth call for ${userId}`);
				}
			}
		}
	};

	return {
		adminUser: { id: 'admin-1', role: 'billing' },
		adminClient: throwingAdminClient as never,
		sessionClient: throwingAdminClient as never,
		session: null,
		audit: vi.fn()
	};
}

function makeRequest(fields: Record<string, string>) {
	return {
		async formData() {
			const formData = new FormData();
			for (const [key, value] of Object.entries(fields)) {
				formData.set(key, value);
			}
			return formData;
		}
	};
}

describe('admin billing event diagnostics route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		platformBillingEventsMock.listDiagnostics.mockResolvedValue({
			events: [],
			diagnosticsError: false
		});
		platformBillingHealthMock.summarize.mockResolvedValue({
			generatedAt: '2026-06-24T12:00:00.000Z',
			overallState: 'healthy',
			states: ['healthy'],
			counts: {
				retryableFailures: 0,
				permanentFailures: 0,
				staleFailedEvents: 0,
				recentPaymentFailures: 0,
				driftedOrganizations: 0,
				staleReconciliation: 0,
				supportAttentionItems: 0
			},
			issues: [],
			diagnosticsError: false
		});
		platformBillingEventsMock.retryEvent.mockResolvedValue({
			ok: true,
			state: 'processed',
			result: 'checkout pending activation recorded'
		});
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
		const ctx = createAdminContext();

		const result = await load({ __ctx: ctx } as unknown as Parameters<typeof load>[0]);

		expect(createPlatformBillingEventsMock).toHaveBeenCalledWith(ctx);
		expect(createPlatformBillingHealthMock).toHaveBeenCalledWith(ctx);
		expect(platformBillingEventsMock.listDiagnostics).toHaveBeenCalledWith({ limit: 50 });
		expect(platformBillingHealthMock.summarize).toHaveBeenCalledWith();
		expect(result).toEqual({
			events: [
				expect.objectContaining({
					id: 'evt_123',
					organization: { id: 'org-1', name: 'Alpha Company' },
					canRetry: true
				})
			],
			diagnosticsError: false,
			adminRole: 'billing',
			billingHealth: expect.objectContaining({
				overallState: 'healthy'
			})
		});
	});

	it('returns degraded billing health when health summarization fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
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
			platformBillingHealthMock.summarize.mockRejectedValueOnce(new Error('health unavailable'));

			const result = await load({ __ctx: createAdminContext() } as unknown as Parameters<typeof load>[0]);

			expect(result).toMatchObject({
				events: [expect.objectContaining({ id: 'evt_123' })],
				diagnosticsError: false,
				adminRole: 'billing',
				billingHealth: {
					overallState: 'diagnostics_unavailable',
					states: ['diagnostics_unavailable'],
					counts: {
						retryableFailures: 0,
						permanentFailures: 0,
						staleFailedEvents: 0,
						recentPaymentFailures: 0,
						driftedOrganizations: 0,
						staleReconciliation: 0,
						supportAttentionItems: 0
					},
					issues: [],
					diagnosticsError: true,
					generatedAt: expect.any(String)
				}
			});
			expect(consoleError).toHaveBeenCalledWith('Admin billing events health query failed:', expect.any(Error));
		} finally {
			consoleError.mockRestore();
		}
	});

	it('delegates retry actions to the platform billing-events seam', async () => {
		const ctx = createAdminContext();

		const result = await actions.retry({
			__ctx: ctx,
			request: makeRequest({ eventId: 'evt_retry' })
		} as unknown as Parameters<NonNullable<(typeof actions)['retry']>>[0]);

		expect(createPlatformBillingEventsMock).toHaveBeenCalledWith(ctx);
		expect(platformBillingEventsMock.retryEvent).toHaveBeenCalledWith('evt_retry');
		expect(result).toEqual({
			success: true,
			eventId: 'evt_retry',
			result: 'checkout pending activation recorded',
			state: 'processed'
		});
	});

	it('preserves retry action failure mapping', async () => {
		platformBillingEventsMock.retryEvent.mockResolvedValueOnce({
			ok: false,
			status: 404,
			error: 'Billing event was not found.'
		});

		const result = await actions.retry({
			__ctx: createAdminContext(),
			request: makeRequest({ eventId: 'evt_missing' })
		} as unknown as Parameters<NonNullable<(typeof actions)['retry']>>[0]);

		expect(platformBillingEventsMock.retryEvent).toHaveBeenCalledWith('evt_missing');
		expect(result).toEqual({
			status: 404,
			data: { error: 'Billing event was not found.', eventId: 'evt_missing' }
		});
	});

	it('passes empty event ids to the use case and maps the resulting validation failure', async () => {
		platformBillingEventsMock.retryEvent.mockResolvedValueOnce({
			ok: false,
			status: 400,
			error: 'Missing billing event ID.'
		});

		const result = await actions.retry({
			__ctx: createAdminContext(),
			request: makeRequest({})
		} as unknown as Parameters<NonNullable<(typeof actions)['retry']>>[0]);

		expect(platformBillingEventsMock.retryEvent).toHaveBeenCalledWith('');
		expect(result).toEqual({
			status: 400,
			data: { error: 'Missing billing event ID.', eventId: '' }
		});
	});
});
