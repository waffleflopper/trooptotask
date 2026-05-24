import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingReconciliationProvider } from '$lib/server/core/useCases/billingReconciliation';
import {
	type BillingReconciliationBatchStore,
	runBillingReconciliationBatch
} from '$lib/server/core/useCases/billingReconciliationBatch';

const baseOrg = {
	id: 'org-1',
	tier: 'team' as const,
	stripe_customer_id: 'cus_123',
	stripe_subscription_id: 'sub_123',
	subscription_status: 'active' as const,
	current_period_end: '2026-06-01T00:00:00.000Z'
};

const baseSnapshot = {
	organization_id: 'org-1',
	source: 'stripe' as const,
	commercial_plan: 'team' as const,
	stripe_customer_id: 'cus_123',
	stripe_subscription_id: 'sub_123',
	stripe_product_id: 'prod_team',
	stripe_price_id: 'price_team',
	subscription_status: 'active' as const,
	collection_status: 'current',
	current_period_start: '2026-05-01T00:00:00.000Z',
	current_period_end: '2026-06-01T00:00:00.000Z',
	cancel_at_period_end: false,
	canceled_at: null,
	trial_end: null,
	sync_status: 'synced' as const,
	last_stripe_event_id: 'evt_123',
	last_stripe_event_type: 'customer.subscription.updated',
	last_stripe_event_created_at: '2026-05-01T00:00:01.000Z',
	last_processed_at: '2026-05-01T00:00:02.000Z',
	last_reconciled_at: null,
	reconciliation_result: null,
	drift_detected: false
};

const baseSubscription = {
	id: 'sub_123',
	customerId: 'cus_123',
	status: 'active' as const,
	priceId: 'price_team',
	productId: 'prod_team',
	currentPeriodStart: '2026-05-01T00:00:00.000Z',
	currentPeriodEnd: '2026-06-01T00:00:00.000Z',
	cancelAtPeriodEnd: false,
	canceledAt: null,
	trialEnd: null,
	metadata: { orgId: 'org-1', tier: 'team' }
};

function createStore(overrides: Partial<BillingReconciliationBatchStore> = {}): BillingReconciliationBatchStore {
	return {
		listCandidates: vi.fn().mockResolvedValue([{ orgId: 'org-1' }, { orgId: 'org-2' }]),
		readOrganization: vi.fn().mockImplementation((orgId: string) => Promise.resolve({ ...baseOrg, id: orgId })),
		readSnapshot: vi.fn().mockImplementation((orgId: string) =>
			Promise.resolve({
				...baseSnapshot,
				organization_id: orgId,
				stripe_subscription_id: orgId === 'org-2' ? 'sub_456' : 'sub_123'
			})
		),
		upsertSnapshot: vi.fn().mockResolvedValue(undefined),
		updateSnapshotDiagnostics: vi.fn().mockResolvedValue(undefined),
		updateOrganizationBillingMirror: vi.fn().mockResolvedValue(undefined),
		...overrides
	};
}

function createProvider(overrides: Partial<BillingReconciliationProvider> = {}): BillingReconciliationProvider {
	return {
		retrieveSubscription: vi.fn().mockImplementation((subscriptionId: string) =>
			Promise.resolve({
				...baseSubscription,
				id: subscriptionId,
				metadata: { orgId: subscriptionId === 'sub_456' ? 'org-2' : 'org-1', tier: 'team' }
			})
		),
		listSubscriptionsForCustomer: vi.fn().mockResolvedValue([baseSubscription]),
		...overrides
	};
}

function createSubscriptionPort() {
	return {
		invalidateTierCache: vi.fn()
	};
}

describe('runBillingReconciliationBatch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('caps candidate batches and returns a pagination cursor', async () => {
		const store = createStore({
			listCandidates: vi.fn().mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({ orgId: `org-${index}` }))),
			readOrganization: vi.fn().mockImplementation((orgId: string) => Promise.resolve({ ...baseOrg, id: orgId })),
			readSnapshot: vi
				.fn()
				.mockImplementation((orgId: string) =>
					Promise.resolve({ ...baseSnapshot, organization_id: orgId, stripe_subscription_id: `sub_${orgId}` })
				)
		});
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockImplementation((subscriptionId: string) => {
				const orgId = subscriptionId.replace('sub_', '');
				return Promise.resolve({ ...baseSubscription, id: subscriptionId, metadata: { orgId, tier: 'team' } });
			})
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 250,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(store.listCandidates).toHaveBeenCalledWith({ limit: 100, cursor: null });
		expect(result.processed).toBe(100);
		expect(result.nextCursor).toBe('org-99');
	});

	it('flags local paid access drift when Stripe reports unpaid state', async () => {
		const store = createStore();
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockResolvedValue({
				...baseSubscription,
				status: 'unpaid',
				metadata: { orgId: 'org-1', tier: 'team' }
			})
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.drifted).toBe(1);
		expect(result.results[0]).toMatchObject({
			orgId: 'org-1',
			ok: true,
			status: 'repaired',
			driftDetected: true,
			diagnostics: expect.arrayContaining(['subscription_status', 'collection_status'])
		});
		expect(store.updateOrganizationBillingMirror).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				tier: 'free',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'past_due'
			})
		);
	});

	it('retains paused subscription IDs in snapshots and the legacy organization mirror', async () => {
		const store = createStore();
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockResolvedValue({
				...baseSubscription,
				status: 'paused',
				metadata: { orgId: 'org-1', tier: 'team' }
			})
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.results[0]).toMatchObject({
			ok: true,
			status: 'repaired',
			driftDetected: true
		});
		expect(store.upsertSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				commercial_plan: 'team',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'paused',
				collection_status: 'current'
			})
		);
		expect(store.updateOrganizationBillingMirror).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				tier: 'team',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'active'
			})
		);
	});

	it('retains incomplete_expired subscription IDs only in billing snapshots', async () => {
		const store = createStore();
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockResolvedValue({
				...baseSubscription,
				status: 'incomplete_expired',
				metadata: { orgId: 'org-1', tier: 'team' }
			})
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.results[0]).toMatchObject({
			ok: true,
			status: 'repaired',
			driftDetected: true
		});
		expect(store.upsertSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				commercial_plan: 'free',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'incomplete_expired',
				collection_status: 'pending_activation'
			})
		);
		expect(store.updateOrganizationBillingMirror).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				tier: 'free',
				stripe_subscription_id: null,
				subscription_status: null
			})
		);
	});

	it('clears canceled subscription IDs from snapshots and the legacy organization mirror', async () => {
		const store = createStore();
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockResolvedValue({
				...baseSubscription,
				status: 'canceled',
				metadata: { orgId: 'org-1', tier: 'team' }
			})
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.results[0]).toMatchObject({
			ok: true,
			status: 'repaired',
			driftDetected: true
		});
		expect(store.upsertSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				commercial_plan: 'free',
				stripe_subscription_id: null,
				subscription_status: 'canceled',
				collection_status: 'canceled'
			})
		);
		expect(store.updateOrganizationBillingMirror).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				tier: 'free',
				stripe_subscription_id: null,
				subscription_status: 'canceled'
			})
		);
	});

	it('reports planned writes without mutating rows during a dry run', async () => {
		const store = createStore();

		const result = await runBillingReconciliationBatch({
			store,
			provider: createProvider({
				retrieveSubscription: vi.fn().mockResolvedValue({
					...baseSubscription,
					status: 'unpaid',
					metadata: { orgId: 'org-1', tier: 'team' }
				})
			}),
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			dryRun: true,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.dryRun).toBe(true);
		expect(result.results[0]).toMatchObject({
			orgId: 'org-1',
			ok: true,
			status: 'repaired',
			dryRun: true,
			plannedWrites: ['organization_billing_snapshots', 'organizations.billing_mirror', 'tier_cache_invalidation']
		});
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
		expect(store.updateOrganizationBillingMirror).not.toHaveBeenCalled();
	});

	it('can seed a review-only snapshot from validated legacy fields when Stripe has no subscription', async () => {
		const store = createStore({
			readSnapshot: vi.fn().mockResolvedValue(null)
		});
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockResolvedValue(null),
			listSubscriptionsForCustomer: vi.fn().mockResolvedValue([])
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.results[0]).toMatchObject({
			ok: false,
			status: 'failed',
			result: 'legacy_snapshot_seeded_for_stripe_review',
			diagnostics: ['missing_stripe_subscription', 'legacy_organization_snapshot_seed'],
			plannedWrites: ['organization_billing_snapshots.legacy_seed']
		});
		expect(store.upsertSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				organization_id: 'org-1',
				source: 'legacy_organization',
				commercial_plan: 'team',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				sync_status: 'needs_reconciliation',
				drift_detected: true
			})
		);
		expect(store.updateOrganizationBillingMirror).not.toHaveBeenCalled();
	});

	it('reports legacy seed writes without mutating rows during dry run', async () => {
		const store = createStore({
			readSnapshot: vi.fn().mockResolvedValue(null)
		});
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockResolvedValue(null),
			listSubscriptionsForCustomer: vi.fn().mockResolvedValue([])
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			dryRun: true,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.results[0]).toMatchObject({
			ok: false,
			status: 'failed',
			dryRun: true,
			plannedWrites: ['organization_billing_snapshots.legacy_seed']
		});
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
	});

	it('does not rewrite an existing legacy review snapshot on later batches', async () => {
		const store = createStore({
			readSnapshot: vi.fn().mockResolvedValue({
				...baseSnapshot,
				source: 'legacy_organization',
				sync_status: 'needs_reconciliation'
			})
		});
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockResolvedValue(null),
			listSubscriptionsForCustomer: vi.fn().mockResolvedValue([])
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.results[0]).toMatchObject({
			ok: false,
			status: 'failed',
			result: 'Legacy billing snapshot still needs Stripe review.',
			plannedWrites: []
		});
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
	});

	it('ignores inactive free legacy organizations without seeding drift snapshots', async () => {
		const store = createStore({
			readOrganization: vi.fn().mockResolvedValue({
				...baseOrg,
				tier: 'free',
				subscription_status: 'canceled'
			}),
			readSnapshot: vi.fn().mockResolvedValue(null)
		});
		const provider = createProvider({
			retrieveSubscription: vi.fn().mockResolvedValue(null),
			listSubscriptionsForCustomer: vi.fn().mockResolvedValue([])
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.results[0]).toMatchObject({
			ok: true,
			status: 'matched',
			driftDetected: false,
			plannedWrites: []
		});
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
	});

	it('continues after partial failures and redacts secret-like diagnostics', async () => {
		const store = createStore({
			upsertSnapshot: vi
				.fn()
				.mockRejectedValueOnce(new Error('db failed sk_test_secret whsec_secret bearer top-secret'))
				.mockResolvedValue(undefined)
		});

		const result = await runBillingReconciliationBatch({
			store,
			provider: createProvider(),
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 2,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.processed).toBe(2);
		expect(result.failed).toBe(1);
		expect(result.succeeded).toBe(1);
		expect(result.results[0]).toMatchObject({
			ok: false,
			status: 'error',
			result: 'Unexpected reconciliation failure.',
			diagnostics: ['db failed [redacted_stripe_key] [redacted_webhook_secret] bearer [redacted]']
		});
	});

	it('redacts provider diagnostics returned by reconciliation failures', async () => {
		const provider = createProvider({
			retrieveSubscription: vi
				.fn()
				.mockRejectedValue(new Error('provider failed rk_live_secret whsec_secret bearer top-secret'))
		});

		const result = await runBillingReconciliationBatch({
			store: createStore(),
			provider,
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 1,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.results[0]).toMatchObject({
			ok: false,
			result: 'Stripe provider read failed.',
			diagnostics: ['provider failed [redacted_stripe_key] [redacted_webhook_secret] bearer [redacted]']
		});
	});

	it('stops before the next candidate when the timeout budget is exhausted', async () => {
		vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(10);
		const store = createStore();

		const result = await runBillingReconciliationBatch({
			store,
			provider: createProvider(),
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 2,
			timeoutMs: 5,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.timedOut).toBe(true);
		expect(result.processed).toBe(1);
		expect(result.nextCursor).toBe('org-1');
	});

	it('returns the input cursor when timeout expires before any candidate is processed', async () => {
		vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(10);
		const store = createStore();

		const result = await runBillingReconciliationBatch({
			store,
			provider: createProvider(),
			createSubscriptionPort: () => createSubscriptionPort(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			limit: 2,
			cursor: 'org-0',
			timeoutMs: 5,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result.timedOut).toBe(true);
		expect(result.processed).toBe(0);
		expect(result.nextCursor).toBe('org-0');
	});
});
