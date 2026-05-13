import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClientMock, invalidateTierCacheMock, verifyWebhookSignatureMock } = vi.hoisted(() => ({
	getAdminClientMock: vi.fn(),
	invalidateTierCacheMock: vi.fn(),
	verifyWebhookSignatureMock: vi.fn()
}));

vi.mock('$lib/server/stripe', () => ({
	verifyWebhookSignature: verifyWebhookSignatureMock,
	pauseSubscription: vi.fn(),
	resumeSubscription: vi.fn()
}));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: getAdminClientMock
}));

vi.mock('$lib/server/subscription', () => ({
	invalidateTierCache: invalidateTierCacheMock
}));

import { POST } from './+server';

function createWebhookSupabaseStub(options: { paymentFailedOrgId?: string } = {}) {
	const orgUpdates: Array<{ values: Record<string, unknown>; column: string; value: unknown }> = [];

	return {
		orgUpdates,
		client: {
			from(table: string) {
				if (table === 'stripe_webhook_events') {
					return {
						select: () => ({
							eq: () => ({
								single: async () => ({ data: null, error: null })
							})
						}),
						upsert: async () => ({ error: null }),
						update: () => ({
							eq: async () => ({ error: null })
						})
					};
				}

				if (table === 'organizations') {
					return {
						select: (columns: string) => ({
							eq: () => ({
								single: async () => {
									if (columns === 'id') {
										return options.paymentFailedOrgId
											? { data: { id: options.paymentFailedOrgId }, error: null }
											: { data: null, error: null };
									}
									return { data: { gift_tier: null, gift_expires_at: null }, error: null };
								}
							})
						}),
						update: (values: Record<string, unknown>) => ({
							eq: async (column: string, value: unknown) => {
								orgUpdates.push({ values, column, value });
								return { error: null };
							}
						})
					};
				}

				throw new Error(`Unexpected table ${table}`);
			}
		}
	};
}

async function postWebhook(event: Record<string, unknown>) {
	verifyWebhookSignatureMock.mockReturnValue(event);

	return POST({
		request: new Request('http://localhost/api/webhooks/stripe', {
			method: 'POST',
			headers: { 'stripe-signature': 'sig_test' },
			body: JSON.stringify(event)
		})
	} as never);
}

describe('POST /api/webhooks/stripe', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('invalidates the effective-tier cache after checkout completes', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_checkout',
			type: 'checkout.session.completed',
			created: 1,
			data: {
				object: {
					metadata: { orgId: 'org-1', tier: 'unit' },
					subscription: 'sub_123',
					customer: 'cus_123'
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.orgUpdates).toContainEqual(
			expect.objectContaining({
				value: 'org-1',
				values: expect.objectContaining({
					tier: 'unit',
					subscription_status: 'active',
					stripe_subscription_id: 'sub_123'
				})
			})
		);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('invalidates the effective-tier cache after subscription updates', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_subscription_updated',
			type: 'customer.subscription.updated',
			created: 1,
			data: {
				object: {
					id: 'sub_123',
					status: 'active',
					metadata: { orgId: 'org-1', tier: 'team' },
					current_period_end: 1_800_000_000,
					pause_collection: null
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.orgUpdates).toContainEqual(
			expect.objectContaining({
				value: 'org-1',
				values: expect.objectContaining({
					tier: 'team',
					stripe_subscription_id: 'sub_123',
					subscription_status: 'active'
				})
			})
		);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('invalidates the effective-tier cache after subscription deletion', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_subscription_deleted',
			type: 'customer.subscription.deleted',
			created: 1,
			data: {
				object: {
					metadata: { orgId: 'org-1' }
				}
			}
		});

		expect(response.status).toBe(200);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('invalidates the effective-tier cache after payment failure marks an org past due', async () => {
		const supabase = createWebhookSupabaseStub({ paymentFailedOrgId: 'org-1' });
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_payment_failed',
			type: 'invoice.payment_failed',
			created: 1,
			data: {
				object: {
					parent: {
						subscription_details: {
							subscription: 'sub_123'
						}
					}
				}
			}
		});

		expect(response.status).toBe(200);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});
});
