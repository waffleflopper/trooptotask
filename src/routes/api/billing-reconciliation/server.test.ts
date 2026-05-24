import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storeMock } = vi.hoisted(() => ({
	storeMock: {
		listCandidates: vi.fn(),
		readOrganization: vi.fn(),
		readSnapshot: vi.fn(),
		upsertSnapshot: vi.fn(),
		updateSnapshotDiagnostics: vi.fn(),
		updateOrganizationBillingMirror: vi.fn()
	}
}));

vi.mock('$lib/server/adapters/supabaseBillingReconciliation', () => ({
	createSupabaseBillingReconciliationStore: () => storeMock
}));

vi.mock('$lib/server/subscription', () => ({
	invalidateTierCache: vi.fn()
}));

vi.mock('$lib/server/billing/priceCatalog', () => ({
	configuredPriceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: 'prod_team' }],
	lookupPriceCatalogEntry: (
		catalog: { priceId: string; commercialPlan: string; stripeProductId: string }[],
		priceId: string | null | undefined
	) => {
		const entry = catalog.find((candidate) => candidate.priceId === priceId);
		return entry ? { ok: true, entry } : { ok: false, reason: 'unknown_price_id', priceId };
	}
}));

import { _runBillingReconciliationEndpointCore } from './+server';

const org = {
	id: 'org-1',
	tier: 'team',
	stripe_customer_id: 'cus_123',
	stripe_subscription_id: 'sub_123',
	subscription_status: 'active',
	current_period_end: '2026-06-01T00:00:00.000Z'
};

const snapshot = {
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

const provider = {
	retrieveSubscription: vi.fn(),
	listSubscriptionsForCustomer: vi.fn()
};

describe('billing reconciliation endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storeMock.listCandidates.mockResolvedValue([{ orgId: 'org-1' }]);
		storeMock.readOrganization.mockResolvedValue(org);
		storeMock.readSnapshot.mockResolvedValue(snapshot);
		storeMock.upsertSnapshot.mockResolvedValue(undefined);
		storeMock.updateSnapshotDiagnostics.mockResolvedValue(undefined);
		storeMock.updateOrganizationBillingMirror.mockResolvedValue(undefined);
		provider.retrieveSubscription.mockResolvedValue({
			id: 'sub_123',
			customerId: 'cus_123',
			status: 'active',
			priceId: 'price_team',
			productId: 'prod_team',
			currentPeriodStart: '2026-05-01T00:00:00.000Z',
			currentPeriodEnd: '2026-06-01T00:00:00.000Z',
			cancelAtPeriodEnd: false,
			canceledAt: null,
			trialEnd: null,
			metadata: { orgId: 'org-1', tier: 'team' }
		});
		provider.listSubscriptionsForCustomer.mockResolvedValue([]);
	});

	it('rejects requests without a bearer token', async () => {
		await expect(
			_runBillingReconciliationEndpointCore({
				authHeader: null,
				secrets: ['expected-secret'],
				url: new URL('http://localhost/api/billing-reconciliation'),
				adminClient: {} as never,
				provider
			})
		).rejects.toMatchObject({ status: 401 });
		expect(storeMock.listCandidates).not.toHaveBeenCalled();
	});

	it('rejects requests without a matching configured bearer token', async () => {
		await expect(
			_runBillingReconciliationEndpointCore({
				authHeader: 'Bearer wrong',
				secrets: ['expected-secret'],
				url: new URL('http://localhost/api/billing-reconciliation'),
				adminClient: {} as never,
				provider
			})
		).rejects.toMatchObject({ status: 401 });
		expect(storeMock.listCandidates).not.toHaveBeenCalled();
	});

	it('accepts the cron bearer token as an alternate secret', async () => {
		const result = await _runBillingReconciliationEndpointCore({
			authHeader: 'Bearer cron-secret',
			secrets: ['billing-secret', 'cron-secret'],
			url: new URL('http://localhost/api/billing-reconciliation'),
			adminClient: {} as never,
			provider,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(result).toMatchObject({ processed: 1, failed: 0 });
	});

	it('runs a capped authorized batch without returning provider secrets', async () => {
		const result = await _runBillingReconciliationEndpointCore({
			authHeader: 'Bearer expected-secret',
			secrets: ['expected-secret'],
			url: new URL('http://localhost/api/billing-reconciliation?limit=500&timeoutMs=1000'),
			adminClient: {} as never,
			provider,
			now: () => new Date('2026-05-23T00:00:00.000Z')
		});

		expect(storeMock.listCandidates).toHaveBeenCalledWith({ limit: 100, cursor: null });
		expect(result).toMatchObject({
			processed: 1,
			failed: 0,
			drifted: 0,
			results: [expect.objectContaining({ orgId: 'org-1', ok: true })]
		});
		expect(JSON.stringify(result)).not.toContain('sk_');
		expect(JSON.stringify(result)).not.toContain('whsec_');
	});

	it('caps caller supplied timeout windows', async () => {
		const dateNow = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(60_000);
		try {
			const result = await _runBillingReconciliationEndpointCore({
				authHeader: 'Bearer expected-secret',
				secrets: ['expected-secret'],
				url: new URL('http://localhost/api/billing-reconciliation?timeoutMs=3600000'),
				adminClient: {} as never,
				provider,
				now: () => new Date('2026-05-23T00:00:00.000Z')
			});

			expect(result).toMatchObject({
				processed: 0,
				timedOut: true,
				nextCursor: null
			});
		} finally {
			dateNow.mockRestore();
		}
	});
});
