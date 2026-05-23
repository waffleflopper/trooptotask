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

vi.mock('$lib/server/billing/priceCatalog', () => ({
	configuredPriceCatalog: [
		{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' },
		{ priceId: 'price_unit', commercialPlan: 'unit', stripeProductId: 'prod_unit' }
	],
	lookupPriceCatalogEntry: (
		catalog: Array<{ priceId: string; commercialPlan: string; stripeProductId: string | null }>,
		priceId: string | null | undefined
	) => {
		if (!priceId) return { ok: false, reason: 'missing_price_id', priceId: null };
		const entry = catalog.find((candidate) => candidate.priceId === priceId);
		return entry ? { ok: true, entry } : { ok: false, reason: 'unknown_price_id', priceId };
	}
}));

import { POST } from './+server';

interface WebhookRow {
	id: string;
	processed?: boolean;
	processing_state?: string | null;
	attempt_count?: number | null;
}

interface WebhookSupabaseOptions {
	existingWebhookEvent?: WebhookRow | null;
	existingBillingSnapshot?: { last_stripe_event_created_at: string | null } | null;
	paymentFailedOrgId?: string;
	failOrganizationUpdate?: string;
	failLedgerRecord?: string;
	billingSnapshotRpcResult?: boolean;
	failBillingSnapshotRpc?: string;
}

function createWebhookSupabaseStub(options: WebhookSupabaseOptions = {}) {
	const orgUpdates: Array<{ values: Record<string, unknown>; column: string; value: unknown }> = [];
	const billingSnapshotUpserts: Record<string, unknown>[] = [];
	const webhookAttemptRecords: Record<string, unknown>[] = [];
	const webhookUpdates: Array<{ values: Record<string, unknown>; filters: Array<[string, string, unknown]> }> = [];

	function webhookUpdate(values: Record<string, unknown>) {
		const filters: Array<[string, string, unknown]> = [];
		const chain = {
			eq(column: string, value: unknown) {
				filters.push(['eq', column, value]);
				return chain;
			},
			lt(column: string, value: unknown) {
				filters.push(['lt', column, value]);
				return chain;
			},
			not(column: string, operator: string, value: unknown) {
				filters.push(['not', `${column}.${operator}`, value]);
				return chain;
			},
			neq(column: string, value: unknown) {
				filters.push(['neq', column, value]);
				webhookUpdates.push({ values, filters });
				return Promise.resolve({ error: null });
			},
			then(resolve: (value: { error: null }) => void) {
				webhookUpdates.push({ values, filters });
				return Promise.resolve({ error: null }).then(resolve);
			}
		};
		return chain;
	}

	return {
		orgUpdates,
		billingSnapshotUpserts,
		webhookAttemptRecords,
		webhookUpdates,
		client: {
			rpc(name: string, args: Record<string, unknown>) {
				if (name === 'record_stripe_webhook_event_attempt') {
					webhookAttemptRecords.push(args);
					return Promise.resolve({
						data: 1,
						error: options.failLedgerRecord ? { message: options.failLedgerRecord } : null
					});
				}

				if (name !== 'upsert_organization_billing_snapshot_if_current') {
					throw new Error(`Unexpected rpc ${name}`);
				}
				billingSnapshotUpserts.push(args.p_snapshot as Record<string, unknown>);
				return Promise.resolve({
					data: options.billingSnapshotRpcResult ?? true,
					error: options.failBillingSnapshotRpc ? { message: options.failBillingSnapshotRpc } : null
				});
			},
			from(table: string) {
				if (table === 'stripe_webhook_events') {
					return {
						select: () => ({
							eq: () => ({
								single: async () => ({ data: options.existingWebhookEvent ?? null, error: null })
							})
						}),
						update: webhookUpdate
					};
				}

				if (table === 'organization_billing_snapshots') {
					return {
						select: () => ({
							eq: () => ({
								single: async () => ({
									data: options.existingBillingSnapshot ?? null,
									error:
										options.existingBillingSnapshot === undefined ? { code: 'PGRST116', message: 'not found' } : null
								})
							})
						}),
						upsert: async (values: Record<string, unknown>) => {
							billingSnapshotUpserts.push(values);
							return { error: null };
						}
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
								return { error: options.failOrganizationUpdate ? { message: options.failOrganizationUpdate } : null };
							}
						})
					};
				}

				throw new Error(`Unexpected table ${table}`);
			}
		}
	};
}

async function postWebhook(event: Record<string, unknown>, signature = 'sig_test') {
	verifyWebhookSignatureMock.mockReturnValue(event);

	return POST({
		request: new Request('http://localhost/api/webhooks/stripe', {
			method: 'POST',
			headers: { 'stripe-signature': signature },
			body: JSON.stringify(event)
		})
	} as never);
}

describe('POST /api/webhooks/stripe', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('verifies the Stripe signature before writing ledger rows', async () => {
		verifyWebhookSignatureMock.mockImplementation(() => {
			throw new Error('bad signature');
		});

		const response = await POST({
			request: new Request('http://localhost/api/webhooks/stripe', {
				method: 'POST',
				headers: { 'stripe-signature': 'sig_test' },
				body: '{}'
			})
		} as never);

		expect(response.status).toBe(400);
		expect(getAdminClientMock).not.toHaveBeenCalled();
	});

	it('records and processes checkout completion events through the ledger', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_checkout',
			type: 'checkout.session.completed',
			created: 1,
			data: {
				object: {
					id: 'cs_123',
					metadata: { orgId: 'org-1', tier: 'unit' },
					subscription: 'sub_123',
					customer: 'cus_123'
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.webhookAttemptRecords).toContainEqual(
			expect.objectContaining({
				p_id: 'evt_checkout',
				p_type: 'checkout.session.completed',
				p_object_id: 'cs_123',
				p_secondary_dedupe_key: 'checkout.session.completed:cs_123',
				p_event_created_at: '1970-01-01T00:00:01.000Z'
			})
		);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processed: true,
					processing_state: 'processed',
					processing_result: 'checkout pending activation recorded for organization org-1'
				})
			})
		);
		expect(supabase.billingSnapshotUpserts).toContainEqual(
			expect.objectContaining({
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'unit',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'incomplete',
				collection_status: 'pending_activation',
				sync_status: 'pending',
				last_stripe_event_id: 'evt_checkout',
				last_stripe_event_created_at: '1970-01-01T00:00:01.000Z'
			})
		);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processing_state: 'superseded',
					processing_result: 'superseded by evt_checkout',
					last_error: null
				}),
				filters: expect.arrayContaining([
					['eq', 'secondary_dedupe_key', 'checkout.session.completed:cs_123'],
					['lt', 'event_created_at', '1970-01-01T00:00:01.000Z'],
					['not', 'processing_state.in', '("processed","permanently_failed")'],
					['neq', 'id', 'evt_checkout']
				])
			})
		);
		expect(supabase.orgUpdates).toContainEqual(
			expect.objectContaining({
				value: 'org-1',
				values: expect.objectContaining({
					stripe_customer_id: 'cus_123',
					subscription_status: 'incomplete',
					stripe_subscription_id: 'sub_123'
				})
			})
		);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('marks older checkout completions superseded without overwriting the newer billing snapshot', async () => {
		const supabase = createWebhookSupabaseStub({
			existingBillingSnapshot: { last_stripe_event_created_at: '1970-01-01T00:00:10.000Z' }
		});
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_checkout_stale',
			type: 'checkout.session.completed',
			created: 1,
			data: {
				object: {
					id: 'cs_123',
					metadata: { orgId: 'org-1', tier: 'unit' },
					subscription: 'sub_123',
					customer: 'cus_123'
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toEqual([]);
		expect(supabase.orgUpdates).toEqual([]);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processed: false,
					processing_state: 'superseded',
					processing_result: 'checkout completion for organization org-1 is older than the current billing snapshot'
				})
			})
		);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});

	it('marks checkout completions superseded when a concurrent newer snapshot wins the atomic upsert', async () => {
		const supabase = createWebhookSupabaseStub({ billingSnapshotRpcResult: false });
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_checkout_race',
			type: 'checkout.session.completed',
			created: 1,
			data: {
				object: {
					id: 'cs_123',
					metadata: { orgId: 'org-1', tier: 'unit' },
					subscription: 'sub_123',
					customer: 'cus_123'
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toContainEqual(
			expect.objectContaining({
				organization_id: 'org-1',
				last_stripe_event_id: 'evt_checkout_race'
			})
		);
		expect(supabase.orgUpdates).toEqual([]);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processed: false,
					processing_state: 'superseded',
					processing_result: 'checkout completion for organization org-1 lost a concurrent billing snapshot update'
				})
			})
		);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});

	it('returns successfully for duplicate processed Stripe event IDs without reprocessing', async () => {
		const supabase = createWebhookSupabaseStub({
			existingWebhookEvent: {
				id: 'evt_checkout',
				processed: true,
				processing_state: 'processed',
				attempt_count: 1
			}
		});
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_checkout',
			type: 'checkout.session.completed',
			created: 1,
			data: {
				object: {
					id: 'cs_123',
					metadata: { orgId: 'org-1', tier: 'unit' },
					subscription: 'sub_123',
					customer: 'cus_123'
				}
			}
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('Already processed');
		expect(supabase.webhookAttemptRecords).toEqual([]);
		expect(supabase.orgUpdates).toEqual([]);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});

	it('marks unsupported event types ignored instead of failed', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_customer_created',
			type: 'customer.created',
			created: 1,
			data: {
				object: {
					id: 'cus_123'
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processed: false,
					processed_at: null,
					processing_state: 'ignored',
					processing_result: 'unsupported event type customer.created',
					last_error: null
				})
			})
		);
		expect(supabase.orgUpdates).toEqual([]);
	});

	it('marks non-retryable supported-event payload problems permanently failed', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_bad_checkout',
			type: 'checkout.session.completed',
			created: 1,
			data: {
				object: {
					id: 'cs_123',
					metadata: { tier: 'unit' },
					subscription: 'sub_123',
					customer: 'cus_123'
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processed: false,
					processing_state: 'permanently_failed',
					last_error: 'checkout.session.completed missing orgId, tier, or subscriptionId',
					processing_result: 'permanent processing failure'
				})
			})
		);
		expect(supabase.orgUpdates).toEqual([]);
	});

	it('marks transient processing errors retryable and redacts secrets from failure metadata', async () => {
		const supabase = createWebhookSupabaseStub({
			failOrganizationUpdate: 'db write failed sk_test_secret whsec_secret+/== stripe-signature=t=1,v1=secret'
		});
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_checkout',
			type: 'checkout.session.completed',
			created: 1,
			data: {
				object: {
					id: 'cs_123',
					metadata: { orgId: 'org-1', tier: 'unit' },
					subscription: 'sub_123',
					customer: 'cus_123'
				}
			}
		});

		expect(response.status).toBe(500);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processed: false,
					processing_state: 'retryable_failed',
					last_error:
						'Failed to update org org-1: db write failed [redacted_stripe_key] [redacted_webhook_secret] stripe-signature=[redacted]',
					error:
						'Failed to update org org-1: db write failed [redacted_stripe_key] [redacted_webhook_secret] stripe-signature=[redacted]',
					processing_result: 'retryable processing failure'
				})
			})
		);
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
					customer: 'cus_123',
					items: {
						data: [
							{
								price: {
									id: 'price_team',
									product: 'prod_team'
								}
							}
						]
					},
					current_period_start: 1_700_000_000,
					current_period_end: 1_800_000_000,
					cancel_at_period_end: false,
					canceled_at: null,
					trial_end: null,
					pause_collection: null
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toContainEqual(
			expect.objectContaining({
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'team',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				stripe_product_id: 'prod_team',
				stripe_price_id: 'price_team',
				subscription_status: 'active',
				collection_status: 'current',
				current_period_start: '2023-11-14T22:13:20.000Z',
				current_period_end: '2027-01-15T08:00:00.000Z',
				sync_status: 'synced',
				last_stripe_event_id: 'evt_subscription_updated'
			})
		);
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

	it('keeps paused subscriptions on their paid billing snapshot', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_subscription_paused',
			type: 'customer.subscription.updated',
			created: 1,
			data: {
				object: {
					id: 'sub_123',
					status: 'paused',
					metadata: { orgId: 'org-1', tier: 'team' },
					customer: 'cus_123',
					items: { data: [{ price: { id: 'price_team', product: 'prod_team' } }] },
					current_period_end: 1_800_000_000,
					cancel_at_period_end: false,
					pause_collection: null
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toContainEqual(
			expect.objectContaining({
				commercial_plan: 'team',
				subscription_status: 'paused',
				collection_status: 'current'
			})
		);
		expect(supabase.orgUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					tier: 'team',
					subscription_status: 'active'
				})
			})
		);
	});

	it('does not grant paid access for incomplete subscription updates', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_subscription_incomplete',
			type: 'customer.subscription.updated',
			created: 1,
			data: {
				object: {
					id: 'sub_123',
					status: 'incomplete',
					metadata: { orgId: 'org-1', tier: 'team' },
					customer: 'cus_123',
					items: { data: [{ price: { id: 'price_team', product: 'prod_team' } }] },
					current_period_end: 1_800_000_000,
					cancel_at_period_end: false,
					pause_collection: null
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toContainEqual(
			expect.objectContaining({
				commercial_plan: 'free',
				stripe_price_id: 'price_team',
				subscription_status: 'incomplete',
				collection_status: 'pending_activation'
			})
		);
		expect(supabase.orgUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					tier: 'free',
					subscription_status: null
				})
			})
		);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('fails closed when an active subscription uses an unknown Stripe price', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_subscription_unknown_price',
			type: 'customer.subscription.updated',
			created: 1,
			data: {
				object: {
					id: 'sub_123',
					status: 'active',
					metadata: { orgId: 'org-1', tier: 'team' },
					customer: 'cus_123',
					items: { data: [{ price: { id: 'price_unknown', product: 'prod_unknown' } }] },
					current_period_end: 1_800_000_000,
					cancel_at_period_end: false,
					pause_collection: null
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toEqual([]);
		expect(supabase.orgUpdates).toEqual([]);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processing_state: 'permanently_failed',
					last_error: 'customer.subscription.updated cannot grant access for org-1: unknown_price_id'
				})
			})
		);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});

	it('fails closed when subscription metadata tier does not match the configured price', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_subscription_metadata_mismatch',
			type: 'customer.subscription.updated',
			created: 1,
			data: {
				object: {
					id: 'sub_123',
					status: 'active',
					metadata: { orgId: 'org-1', tier: 'unit' },
					customer: 'cus_123',
					items: { data: [{ price: { id: 'price_team', product: 'prod_team' } }] },
					current_period_end: 1_800_000_000,
					cancel_at_period_end: false,
					pause_collection: null
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toEqual([]);
		expect(supabase.orgUpdates).toEqual([]);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processing_state: 'permanently_failed',
					last_error: 'customer.subscription.updated metadata tier unit does not match price catalog plan team'
				})
			})
		);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});

	it('does not permanently fail incomplete subscription updates for stale metadata tier mismatches', async () => {
		const supabase = createWebhookSupabaseStub();
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_subscription_incomplete_mismatch',
			type: 'customer.subscription.updated',
			created: 1,
			data: {
				object: {
					id: 'sub_123',
					status: 'incomplete',
					metadata: { orgId: 'org-1', tier: 'unit' },
					customer: 'cus_123',
					items: { data: [{ price: { id: 'price_team', product: 'prod_team' } }] },
					current_period_end: 1_800_000_000,
					cancel_at_period_end: false,
					pause_collection: null
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toContainEqual(
			expect.objectContaining({
				commercial_plan: 'free',
				stripe_price_id: 'price_team',
				subscription_status: 'incomplete',
				collection_status: 'pending_activation'
			})
		);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processing_state: 'processed'
				})
			})
		);
	});

	it('marks older subscription events superseded without overwriting the newer billing snapshot', async () => {
		const supabase = createWebhookSupabaseStub({
			existingBillingSnapshot: { last_stripe_event_created_at: '1970-01-01T00:00:10.000Z' }
		});
		getAdminClientMock.mockReturnValue(supabase.client);

		const response = await postWebhook({
			id: 'evt_subscription_stale',
			type: 'customer.subscription.updated',
			created: 1,
			data: {
				object: {
					id: 'sub_123',
					status: 'active',
					metadata: { orgId: 'org-1', tier: 'team' },
					customer: 'cus_123',
					items: { data: [{ price: { id: 'price_team', product: 'prod_team' } }] },
					current_period_end: 1_800_000_000,
					cancel_at_period_end: false,
					pause_collection: null
				}
			}
		});

		expect(response.status).toBe(200);
		expect(supabase.billingSnapshotUpserts).toEqual([]);
		expect(supabase.orgUpdates).toEqual([]);
		expect(supabase.webhookUpdates).toContainEqual(
			expect.objectContaining({
				values: expect.objectContaining({
					processed: false,
					processing_state: 'superseded',
					processing_result: 'subscription update for organization org-1 is older than the current billing snapshot'
				})
			})
		);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
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
					id: 'sub_123',
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
					id: 'in_123',
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
