import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invalidateTierCacheMock, pauseSubscriptionMock, resumeSubscriptionMock, reconcileOrganizationBillingMock } =
	vi.hoisted(() => ({
		invalidateTierCacheMock: vi.fn(),
		pauseSubscriptionMock: vi.fn(),
		resumeSubscriptionMock: vi.fn(),
		reconcileOrganizationBillingMock: vi.fn()
	}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event),
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/subscription', () => ({
	invalidateTierCache: invalidateTierCacheMock
}));

vi.mock('$lib/server/stripe', () => ({
	pauseSubscription: pauseSubscriptionMock,
	resumeSubscription: resumeSubscriptionMock,
	createStripeBillingReconciliationProvider: () => ({ provider: 'stripe' })
}));

vi.mock('$lib/server/core/useCases/billingReconciliation', () => ({
	reconcileOrganizationBilling: reconcileOrganizationBillingMock
}));

vi.mock('$lib/server/adapters/supabaseBillingReconciliation', () => ({
	createSupabaseBillingReconciliationStore: () => ({ store: 'supabase' })
}));

vi.mock('$lib/server/billing/priceCatalog', () => ({
	configuredPriceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: null }]
}));

import { actions } from './+page.server';

function makeRequest(form: Record<string, string>): Request {
	const body = new URLSearchParams(form);
	return new Request('http://localhost/admin/organizations/org-1', {
		method: 'POST',
		body
	});
}

function makeAdminClient(org: Record<string, unknown>) {
	const updateEq = vi.fn().mockResolvedValue({ error: null });
	const single = vi.fn().mockResolvedValue({ data: org, error: null });
	const eqAfterSelect = vi.fn(() => ({ single }));
	const select = vi.fn(() => ({ eq: eqAfterSelect }));
	const update = vi.fn(() => ({ eq: updateEq }));
	const from = vi.fn(() => ({ select, update }));

	return {
		client: { from },
		update,
		updateEq,
		single
	};
}

function makeContext(adminClient: unknown) {
	return {
		adminClient,
		adminUser: { id: 'admin-1', role: 'super_admin' },
		audit: vi.fn()
	};
}

describe('admin organization gifting actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		reconcileOrganizationBillingMock.mockResolvedValue({
			ok: true,
			status: 'repaired',
			result: 'repaired_drift:commercial_plan',
			driftDetected: true,
			diagnostics: ['commercial_plan'],
			snapshotUpdated: true,
			reconciledAt: '2026-05-23T00:00:00.000Z'
		});
	});

	it('invalidates effective tier cache after gifting from the organization detail page', async () => {
		const adminClient = makeAdminClient({
			id: 'org-1',
			tier: 'free',
			stripe_subscription_id: null,
			subscription_status: null
		});

		const result = await actions.giftTier({
			__ctx: makeContext(adminClient.client),
			params: { orgId: 'org-1' },
			request: makeRequest({ giftTier: 'team', days: '30' })
		} as unknown as Parameters<(typeof actions)['giftTier']>[0]);

		expect(result).toEqual({ success: true });
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('invalidates effective tier cache after revoking a gift from the organization detail page', async () => {
		const adminClient = makeAdminClient({
			id: 'org-1',
			stripe_subscription_id: null,
			subscription_status: null
		});

		const result = await actions.revokeGift({
			__ctx: makeContext(adminClient.client),
			params: { orgId: 'org-1' },
			request: makeRequest({})
		} as unknown as Parameters<(typeof actions)['revokeGift']>[0]);

		expect(result).toEqual({ success: true });
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('invalidates effective tier cache after extending a gift from the organization detail page', async () => {
		const adminClient = makeAdminClient({
			id: 'org-1',
			gift_tier: 'team',
			gift_expires_at: new Date('2026-05-01T00:00:00.000Z').toISOString()
		});

		const result = await actions.extendGift({
			__ctx: makeContext(adminClient.client),
			params: { orgId: 'org-1' },
			request: makeRequest({ days: '15' })
		} as unknown as Parameters<(typeof actions)['extendGift']>[0]);

		expect(result).toEqual({ success: true });
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('runs manual billing reconciliation and audits support-safe diagnostics', async () => {
		const adminClient = makeAdminClient({ id: 'org-1' });
		const ctx = makeContext(adminClient.client);

		const result = await actions.reconcileBilling({
			__ctx: ctx,
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({})
		} as unknown as Parameters<(typeof actions)['reconcileBilling']>[0]);

		expect(result).toEqual({
			billingReconciliation: {
				success: true,
				status: 'repaired',
				message: 'Billing snapshot refreshed from Stripe.',
				diagnostics: ['commercial_plan']
			}
		});
		expect(reconcileOrganizationBillingMock).toHaveBeenCalledWith(
			expect.objectContaining({
				orgId: '11111111-1111-4111-8111-111111111111',
				priceCatalog: [{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: null }]
			})
		);
		expect(ctx.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.org.billing_reconcile',
				resourceType: 'organization',
				resourceId: '11111111-1111-4111-8111-111111111111',
				severity: 'info',
				details: expect.objectContaining({
					result: 'repaired_drift:commercial_plan',
					driftDetected: true,
					diagnostics: ['commercial_plan']
				})
			})
		);
	});

	it('reports when manual billing reconciliation already matches Stripe', async () => {
		reconcileOrganizationBillingMock.mockResolvedValue({
			ok: true,
			status: 'matched',
			result: 'matched',
			driftDetected: false,
			diagnostics: [],
			snapshotUpdated: false,
			reconciledAt: '2026-05-23T00:00:00.000Z'
		});
		const adminClient = makeAdminClient({ id: 'org-1' });
		const ctx = makeContext(adminClient.client);

		const result = await actions.reconcileBilling({
			__ctx: ctx,
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({})
		} as unknown as Parameters<(typeof actions)['reconcileBilling']>[0]);

		expect(result).toEqual({
			billingReconciliation: {
				success: true,
				status: 'matched',
				message: 'Billing already matched Stripe.',
				diagnostics: []
			}
		});
		expect(ctx.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				severity: 'info',
				details: expect.objectContaining({
					result: 'matched',
					driftDetected: false,
					snapshotUpdated: false
				})
			})
		);
	});

	it('returns a support-safe billing reconciliation failure without secrets', async () => {
		reconcileOrganizationBillingMock.mockResolvedValue({
			ok: false,
			status: 'failed',
			result: 'Stripe subscription is missing orgId metadata.',
			driftDetected: true,
			diagnostics: ['missing_org_metadata'],
			snapshotUpdated: false,
			reconciledAt: '2026-05-23T00:00:00.000Z'
		});
		const adminClient = makeAdminClient({ id: 'org-1' });

		const result = await actions.reconcileBilling({
			__ctx: makeContext(adminClient.client),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({})
		} as unknown as Parameters<(typeof actions)['reconcileBilling']>[0]);

		expect(result).toEqual({
			status: 400,
			data: {
				billingReconciliation: {
					success: false,
					message: 'Stripe subscription is missing orgId metadata.',
					diagnostics: ['missing_org_metadata']
				}
			}
		});
		expect(JSON.stringify(result)).not.toContain('sk_');
	});
});
