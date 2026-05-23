import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	BillingReconciliationProvider,
	BillingReconciliationSnapshotRow,
	BillingReconciliationStore
} from './billingReconciliation';

const { invalidateTierCacheMock } = vi.hoisted(() => ({
	invalidateTierCacheMock: vi.fn()
}));

vi.mock('$lib/server/subscription', () => ({
	invalidateTierCache: invalidateTierCacheMock
}));

import { reconcileOrganizationBilling } from './billingReconciliation';

const org = {
	id: 'org-1',
	tier: 'free' as const,
	stripe_customer_id: 'cus_123',
	stripe_subscription_id: 'sub_123',
	subscription_status: 'past_due' as const,
	current_period_end: null
};

const subscription = {
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

const matchingSnapshot: BillingReconciliationSnapshotRow = {
	organization_id: 'org-1',
	source: 'stripe',
	commercial_plan: 'team',
	stripe_customer_id: 'cus_123',
	stripe_subscription_id: 'sub_123',
	stripe_product_id: 'prod_team',
	stripe_price_id: 'price_team',
	subscription_status: 'active',
	collection_status: 'current',
	current_period_start: '2026-05-01T00:00:00.000Z',
	current_period_end: '2026-06-01T00:00:00.000Z',
	cancel_at_period_end: false,
	canceled_at: null,
	trial_end: null,
	sync_status: 'synced',
	last_stripe_event_id: 'evt_123',
	last_stripe_event_type: 'customer.subscription.updated',
	last_stripe_event_created_at: '2026-05-01T00:00:01.000Z',
	last_processed_at: '2026-05-01T00:00:02.000Z',
	last_reconciled_at: null,
	reconciliation_result: null,
	drift_detected: false
};

function createStore(
	snapshot: BillingReconciliationSnapshotRow | null = matchingSnapshot
): BillingReconciliationStore & {
	upsertSnapshot: ReturnType<typeof vi.fn>;
	updateSnapshotDiagnostics: ReturnType<typeof vi.fn>;
	updateOrganizationBillingMirror: ReturnType<typeof vi.fn>;
} {
	return {
		readOrganization: vi.fn().mockResolvedValue(org),
		readSnapshot: vi.fn().mockResolvedValue(snapshot),
		upsertSnapshot: vi.fn().mockResolvedValue(undefined),
		updateSnapshotDiagnostics: vi.fn().mockResolvedValue(undefined),
		updateOrganizationBillingMirror: vi.fn().mockResolvedValue(undefined)
	};
}

function createProvider(overrides: Partial<BillingReconciliationProvider> = {}): BillingReconciliationProvider {
	return {
		retrieveSubscription: vi.fn().mockResolvedValue(subscription),
		listSubscriptionsForCustomer: vi.fn().mockResolvedValue([subscription]),
		...overrides
	};
}

describe('reconcileOrganizationBilling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('records a matched reconciliation without marking drift', async () => {
		const store = createStore();

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ ok: true, status: 'matched', driftDetected: false, snapshotUpdated: false });
		expect(store.upsertSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				organization_id: 'org-1',
				commercial_plan: 'team',
				last_reconciled_at: '2026-05-23T00:00:00.000Z',
				reconciliation_result: 'matched',
				drift_detected: false
			})
		);
		expect(store.upsertSnapshot.mock.calls[0][0]).not.toHaveProperty('last_processed_at');
		expect(store.updateOrganizationBillingMirror).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				tier: 'team',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'active',
				current_period_end: '2026-06-01T00:00:00.000Z'
			})
		);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('repairs drift from the provider snapshot', async () => {
		const store = createStore({ ...matchingSnapshot, commercial_plan: 'free', subscription_status: 'past_due' });

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ ok: true, status: 'repaired', driftDetected: true, snapshotUpdated: true });
		expect(result.diagnostics).toEqual(expect.arrayContaining(['commercial_plan', 'subscription_status']));
		expect(store.upsertSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				commercial_plan: 'team',
				subscription_status: 'active',
				reconciliation_result: expect.stringContaining('repaired_drift:'),
				drift_detected: true
			})
		);
	});

	it('fails closed when Stripe has no subscription for the organization', async () => {
		const store = createStore({ ...matchingSnapshot, stripe_subscription_id: null });
		store.readOrganization = vi.fn().mockResolvedValue({ ...org, stripe_subscription_id: null });

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider({
				retrieveSubscription: vi.fn().mockResolvedValue(null),
				listSubscriptionsForCustomer: vi.fn().mockResolvedValue([])
			}),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ ok: false, status: 'failed', diagnostics: ['missing_subscription'] });
		expect(store.updateSnapshotDiagnostics).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				sync_status: 'needs_reconciliation',
				drift_detected: true,
				reconciliation_result: 'No Stripe subscription was found for this organization.'
			})
		);
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
	});

	it('fails closed for unknown price IDs without mutating billing state', async () => {
		const store = createStore();

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider(),
			priceCatalog: [{ priceId: 'price_unit', commercialPlan: 'unit', stripeProductId: 'prod_unit' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ ok: false, status: 'failed', diagnostics: ['unknown_price_id'] });
		expect(store.updateSnapshotDiagnostics).toHaveBeenCalled();
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
		expect(store.updateOrganizationBillingMirror).not.toHaveBeenCalled();
	});

	it('fails closed for missing metadata', async () => {
		const store = createStore();

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider({
				retrieveSubscription: vi.fn().mockResolvedValue({ ...subscription, metadata: { tier: 'team' } })
			}),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ ok: false, status: 'failed', diagnostics: ['missing_org_metadata'] });
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
	});

	it('fails closed for metadata pointing to another organization', async () => {
		const store = createStore();

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider({
				retrieveSubscription: vi.fn().mockResolvedValue({
					...subscription,
					metadata: { orgId: 'org-2', tier: 'team' }
				})
			}),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ ok: false, status: 'failed', diagnostics: ['metadata_org_mismatch'] });
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
		expect(store.updateOrganizationBillingMirror).not.toHaveBeenCalled();
	});

	it('fails closed for tier metadata that does not match the price catalog', async () => {
		const store = createStore();

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider({
				retrieveSubscription: vi.fn().mockResolvedValue({
					...subscription,
					metadata: { orgId: 'org-1', tier: 'unit' }
				})
			}),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({
			ok: false,
			status: 'failed',
			diagnostics: ['metadata_tier_price_mismatch']
		});
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
		expect(store.updateOrganizationBillingMirror).not.toHaveBeenCalled();
	});

	it('does not write snapshot diagnostics when the organization is gone', async () => {
		const store = createStore();
		store.readOrganization = vi.fn().mockResolvedValue(null);

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider(),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ ok: false, status: 'failed', diagnostics: ['organization_not_found'] });
		expect(store.updateSnapshotDiagnostics).not.toHaveBeenCalled();
		expect(store.upsertSnapshot).not.toHaveBeenCalled();
	});

	it('fails closed when the provider read fails', async () => {
		const store = createStore();

		const result = await reconcileOrganizationBilling({
			orgId: 'org-1',
			store,
			provider: createProvider({
				retrieveSubscription: vi.fn().mockRejectedValue(new Error('Stripe timeout'))
			}),
			priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ ok: false, status: 'failed', diagnostics: ['Stripe timeout'] });
		expect(store.updateSnapshotDiagnostics).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({
				reconciliation_result: 'Stripe provider read failed.',
				sync_status: 'needs_reconciliation'
			})
		);
	});
});
