import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	invalidateTierCacheMock,
	pauseSubscriptionMock,
	resumeSubscriptionMock,
	reconcileOrganizationBillingMock,
	grantFeatureOverrideMock,
	revokeFeatureOverrideMock
} = vi.hoisted(() => ({
	invalidateTierCacheMock: vi.fn(),
	pauseSubscriptionMock: vi.fn(),
	resumeSubscriptionMock: vi.fn(),
	reconcileOrganizationBillingMock: vi.fn(),
	grantFeatureOverrideMock: vi.fn(),
	revokeFeatureOverrideMock: vi.fn()
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction:
		(config: { requiredRole?: string; fn: (ctx: unknown, event: unknown) => unknown }) =>
		(event: { __ctx: { adminUser?: { role?: string } } }) => {
			if (config.requiredRole && event.__ctx.adminUser?.role !== config.requiredRole) {
				return { status: 403, data: { error: 'Not authorized for this action.' } };
			}
			return config.fn(event.__ctx, event);
		},
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

vi.mock('$lib/server/adapters/supabaseDataStore', () => ({
	createSupabaseDataStore: (client: unknown) => ({ client })
}));

vi.mock('$lib/server/core/useCases/planFeatureOverrides', () => ({
	grantOrganizationPlanFeatureOverride: grantFeatureOverrideMock,
	revokeOrganizationPlanFeatureOverride: revokeFeatureOverrideMock
}));

vi.mock('$lib/server/billing/priceCatalog', () => ({
	getConfiguredPriceCatalog: () => [
		{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: null, activeForCheckout: true }
	]
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

function makeContext(adminClient: unknown, role = 'super_admin') {
	return {
		adminClient,
		adminUser: { id: 'admin-1', role },
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
		grantFeatureOverrideMock.mockResolvedValue({
			id: 'override-1',
			feature_key: 'advanced_reporting',
			override_state: 'granted'
		});
		revokeFeatureOverrideMock.mockResolvedValue({
			id: '22222222-2222-4222-8222-222222222222',
			feature_key: 'advanced_reporting'
		});
	});

	it('invalidates effective tier cache after gifting from the organization detail page', async () => {
		const adminClient = makeAdminClient({
			id: 'org-1',
			tier: 'free',
			stripe_subscription_id: null,
			subscription_status: null
		});
		const ctx = makeContext(adminClient.client);

		const result = await actions.giftTier({
			__ctx: ctx,
			params: { orgId: 'org-1' },
			request: makeRequest({ giftTier: 'team', days: '30' })
		} as unknown as Parameters<(typeof actions)['giftTier']>[0]);

		expect(result).toEqual({ success: true });
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
		expect(ctx.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.org.gift_tier',
				resourceType: 'organization',
				resourceId: 'org-1',
				orgId: 'org-1',
				details: { giftTier: 'team', days: 30 },
				severity: 'warning'
			})
		);
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
				priceCatalog: [
					{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: null, activeForCheckout: true }
				]
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

	it('sets a plan feature override through the audited organization detail action', async () => {
		const adminClient = makeAdminClient({ id: 'org-1' });
		const ctx = makeContext(adminClient.client);

		const result = await actions.setFeatureOverride({
			__ctx: ctx,
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({
				featureKey: 'advanced_reporting',
				state: 'granted',
				expiresAt: '2999-01-01T00:00:00.000Z',
				reason: 'Temporary support override'
			})
		} as unknown as Parameters<(typeof actions)['setFeatureOverride']>[0]);

		expect(result).toEqual({
			success: true,
			planFeatureOverride: {
				action: 'set',
				id: 'override-1',
				featureKey: 'advanced_reporting',
				state: 'granted'
			}
		});
		expect(grantFeatureOverrideMock).toHaveBeenCalledWith(
			expect.objectContaining({
				admin: { userId: 'admin-1', role: 'super_admin' }
			}),
			{
				orgId: '11111111-1111-4111-8111-111111111111',
				featureKey: 'advanced_reporting',
				state: 'granted',
				expiresAt: '2999-01-01T00:00:00.000Z',
				reason: 'Temporary support override'
			}
		);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
	});

	it('rejects invalid feature override expiry before calling the use case', async () => {
		const adminClient = makeAdminClient({ id: 'org-1' });

		const result = await actions.setFeatureOverride({
			__ctx: makeContext(adminClient.client),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({
				featureKey: 'advanced_reporting',
				state: 'granted',
				expiresAt: 'not-a-date'
			})
		} as unknown as Parameters<(typeof actions)['setFeatureOverride']>[0]);

		expect(result).toEqual({
			status: 400,
			data: { error: { message: 'Invalid expiry date' } }
		});
		expect(grantFeatureOverrideMock).not.toHaveBeenCalled();
	});

	it('revokes a plan feature override through the organization detail action', async () => {
		const adminClient = makeAdminClient({ id: 'org-1' });

		const result = await actions.revokeFeatureOverride({
			__ctx: makeContext(adminClient.client),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({ overrideId: '22222222-2222-4222-8222-222222222222' })
		} as unknown as Parameters<(typeof actions)['revokeFeatureOverride']>[0]);

		expect(result).toEqual({
			success: true,
			planFeatureOverride: {
				action: 'revoke',
				id: '22222222-2222-4222-8222-222222222222',
				featureKey: 'advanced_reporting'
			}
		});
		expect(revokeFeatureOverrideMock).toHaveBeenCalledWith(expect.any(Object), {
			orgId: '11111111-1111-4111-8111-111111111111',
			overrideId: '22222222-2222-4222-8222-222222222222'
		});
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
	});

	it('rejects invalid feature override IDs before calling revoke', async () => {
		const adminClient = makeAdminClient({ id: 'org-1' });

		const result = await actions.revokeFeatureOverride({
			__ctx: makeContext(adminClient.client),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({ overrideId: 'not-a-uuid' })
		} as unknown as Parameters<(typeof actions)['revokeFeatureOverride']>[0]);

		expect(result).toEqual({
			status: 400,
			data: { error: { message: 'Invalid override ID' } }
		});
		expect(revokeFeatureOverrideMock).not.toHaveBeenCalled();
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

	it('denies manual billing reconciliation for support admins', async () => {
		const adminClient = makeAdminClient({ id: 'org-1' });
		const ctx = makeContext(adminClient.client, 'support');

		const result = await actions.reconcileBilling({
			__ctx: ctx,
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({})
		} as unknown as Parameters<(typeof actions)['reconcileBilling']>[0]);

		expect(result).toEqual({ status: 403, data: { error: 'Not authorized for this action.' } });
		expect(reconcileOrganizationBillingMock).not.toHaveBeenCalled();
		expect(ctx.audit).not.toHaveBeenCalled();
	});

	it('returns a support-safe billing reconciliation failure without secrets', async () => {
		reconcileOrganizationBillingMock.mockResolvedValue({
			ok: false,
			status: 'failed',
			result: 'Stripe subscription is missing orgId metadata with sk_test_secret stripe-signature=t=1,v1=abc.',
			driftDetected: true,
			diagnostics: [
				'missing_org_metadata',
				'provider failed sk_test_secret whsec_secret stripe-signature=t=1,v1=abc bearer top-secret',
				'header failed Stripe-Signature: t=2,v1=xyz.'
			],
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
			status: 400,
			data: {
				billingReconciliation: {
					success: false,
					message:
						'Stripe subscription is missing orgId metadata with [redacted_stripe_key] stripe-signature=[redacted].',
					diagnostics: [
						'missing_org_metadata',
						'provider failed [redacted_stripe_key] [redacted_webhook_secret] stripe-signature=[redacted] bearer [redacted]',
						'header failed stripe-signature=[redacted].'
					]
				}
			}
		});
		expect(JSON.stringify(ctx.audit.mock.calls)).not.toContain('sk_test_secret');
		expect(JSON.stringify(ctx.audit.mock.calls)).not.toContain('whsec_secret');
		expect(JSON.stringify(ctx.audit.mock.calls)).not.toContain('v1=abc');
		expect(JSON.stringify(ctx.audit.mock.calls)).not.toContain('v1=xyz');
		expect(JSON.stringify(result)).not.toContain('sk_test_secret');
		expect(JSON.stringify(result)).not.toContain('v1=abc');
		expect(JSON.stringify(result)).not.toContain('v1=xyz');
	});
});
