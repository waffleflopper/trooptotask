import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingReconciliationBatchStore } from './billingReconciliationBatch';
import type { BillingReconciliationProvider } from './billingReconciliation';
import { runBillingReconciliationBatch } from './billingReconciliationBatch';

const { invalidateTierCacheMock } = vi.hoisted(() => ({
	invalidateTierCacheMock: vi.fn()
}));

vi.mock('$lib/server/subscription', () => ({
	invalidateTierCache: invalidateTierCacheMock
}));

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
				subscription_status: 'past_due'
			})
		);
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
