import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	invalidateTierCacheMock,
	pauseSubscriptionMock,
	resumeSubscriptionMock,
	reconcileOrganizationBillingMock,
	grantFeatureOverrideMock,
	revokeFeatureOverrideMock,
	platformGiftingMock,
	platformAuditMock,
	platformMetricsMock,
	platformMembershipAdministrationMock,
	platformOrganizationDetailMock,
	createPlatformOrganizationDetailMock
} = vi.hoisted(() => ({
	invalidateTierCacheMock: vi.fn(),
	pauseSubscriptionMock: vi.fn(),
	resumeSubscriptionMock: vi.fn(),
	reconcileOrganizationBillingMock: vi.fn(),
	grantFeatureOverrideMock: vi.fn(),
	revokeFeatureOverrideMock: vi.fn(),
	platformGiftingMock: {
		listOrganizations: vi.fn(),
		getOrganizationGiftState: vi.fn(),
		grantGift: vi.fn(),
		revokeGift: vi.fn(),
		extendGift: vi.fn()
	},
	platformAuditMock: {
		listLogs: vi.fn(),
		listRecentByOrganization: vi.fn(),
		listRecentByUser: vi.fn()
	},
	platformMetricsMock: {
		countActivePersonnelForOrganization: vi.fn()
	},
	platformMembershipAdministrationMock: {
		listMembers: vi.fn(),
		makeAdmin: vi.fn(),
		transferOwnership: vi.fn()
	},
	platformOrganizationDetailMock: {
		getOrganizationDetail: vi.fn()
	},
	createPlatformOrganizationDetailMock: vi.fn()
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction:
		(config: { requiredRole?: string | string[]; fn: (ctx: unknown, event: unknown) => unknown }) =>
		(event: { __ctx: { adminUser?: { role?: string } } }) => {
			const allowedRoles = Array.isArray(config.requiredRole) ? config.requiredRole : [config.requiredRole];
			if (config.requiredRole && !allowedRoles.includes(event.__ctx.adminUser?.role)) {
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

vi.mock('$lib/server/adapters/supabasePlatformGifting', () => ({
	createSupabasePlatformGifting: () => platformGiftingMock
}));

vi.mock('$lib/server/adapters/supabasePlatformAudit', () => ({
	createSupabasePlatformAudit: () => platformAuditMock
}));

vi.mock('$lib/server/adapters/supabasePlatformMetrics', () => ({
	createSupabasePlatformMetrics: () => platformMetricsMock
}));

vi.mock('$lib/server/adapters/supabasePlatformMembershipAdministration', () => ({
	createSupabasePlatformMembershipAdministration: () => platformMembershipAdministrationMock
}));

vi.mock('$lib/server/adapters/supabasePlatformOrganizationDetail', () => ({
	createSupabasePlatformOrganizationDetail: createPlatformOrganizationDetailMock
}));

vi.mock('$lib/server/core/useCases/planFeatureOverrides', () => ({
	grantOrganizationPlanFeatureOverride: grantFeatureOverrideMock,
	revokeOrganizationPlanFeatureOverride: revokeFeatureOverrideMock
}));

vi.mock('$lib/server/core/useCases/planPolicy', () => ({
	isPlanFeatureKey: (value: string) => value === 'advanced_reporting',
	readEffectivePlanPolicy: vi.fn().mockResolvedValue({
		source: 'tier',
		billingSource: 'legacy_organization',
		entitlements: {}
	})
}));

vi.mock('$lib/server/core/useCases/organizationPlanUsage', () => ({
	readOrganizationPlanUsage: vi.fn().mockResolvedValue({
		organizationId: '11111111-1111-4111-8111-111111111111',
		sources: {}
	})
}));

vi.mock('$lib/server/core/useCases/planAdminDiagnostics', () => ({
	buildPlanAdminDiagnostics: vi.fn(() => ({ overLimitReasons: [] }))
}));

vi.mock('$lib/server/billing/priceCatalog', () => ({
	getConfiguredPriceCatalog: () => [
		{ priceId: 'price_team', commercialPlan: 'team', stripeProductId: null, activeForCheckout: true }
	]
}));

import { actions, load } from './+page.server';

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

function makeNoOrganizationGiftClient() {
	return {
		from: vi.fn((table: string) => {
			if (table === 'organizations') throw new Error('route must use PlatformGifting for gift actions');
			throw new Error(`Unexpected table ${table}`);
		})
	};
}

function makeNoMembershipAdministrationClient() {
	return {
		from: vi.fn((table: string) => {
			throw new Error(`route must use PlatformMembershipAdministration for role actions, not ${table}`);
		})
	};
}

function makeOrgDetailLoadClient() {
	return {
		from: vi.fn((table: string) => {
			throw new Error(`route load must use PlatformOrganizationDetail, not ${table}`);
		})
	};
}

function makeOrgDetailLoadData() {
	return {
		adminRole: 'super_admin',
		org: {
			id: '11111111-1111-4111-8111-111111111111',
			name: 'Able Company',
			subscriptionTier: 'free',
			giftTier: null,
			giftExpiresAt: null,
			suspendedAt: null,
			createdAt: '2026-06-01T00:00:00.000Z',
			effectiveTier: 'free',
			isSuspended: false
		},
		billingSnapshot: null,
		planPolicy: {
			source: 'legacy_organization',
			billingSource: 'legacy_organization',
			entitlements: []
		},
		planDiagnostics: {
			effectivePlan: {
				commercialPlan: 'free',
				tier: 'free',
				source: 'legacy_organization',
				sourceLabel: 'Organization tier',
				billingSource: 'legacy_organization',
				giftTier: null,
				giftExpiresAt: null
			},
			grace: { mode: 'none', message: null },
			readOnly: { enabled: false, reasons: [] },
			usageRows: [],
			overLimitReasons: [],
			entitlements: []
		},
		cancellationSummary: null,
		members: [{ userId: 'user-1', email: 'owner@example.com', role: 'owner' }],
		personnelCount: 3,
		auditEvents: [
			{
				id: 'audit-1',
				action: 'admin.org.extend_gift',
				userId: 'admin-1',
				timestamp: '2026-06-08T16:00:00.000Z',
				severity: 'info',
				resourceType: 'organization',
				resourceId: '11111111-1111-4111-8111-111111111111'
			}
		]
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
		createPlatformOrganizationDetailMock.mockReturnValue(platformOrganizationDetailMock);
		platformOrganizationDetailMock.getOrganizationDetail.mockResolvedValue({
			status: 'found',
			detail: makeOrgDetailLoadData()
		});
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
		platformGiftingMock.grantGift.mockResolvedValue({ status: 'updated', action: 'gift', orgId: 'org-1' });
		platformGiftingMock.revokeGift.mockResolvedValue({ status: 'updated', action: 'revoke', orgId: 'org-1' });
		platformGiftingMock.extendGift.mockResolvedValue({ status: 'updated', action: 'extend', orgId: 'org-1' });
		platformGiftingMock.getOrganizationGiftState.mockResolvedValue({
			id: '11111111-1111-4111-8111-111111111111',
			name: 'Able Company',
			tier: 'free',
			giftTier: null,
			giftExpiresAt: null,
			giftedBy: null,
			stripeSubscriptionId: null,
			subscriptionStatus: null,
			stripeCustomerId: null
		});
		platformMetricsMock.countActivePersonnelForOrganization.mockResolvedValue(3);
		platformMembershipAdministrationMock.listMembers.mockResolvedValue([
			{ userId: 'user-1', role: 'owner', email: 'owner@example.com' }
		]);
		platformMembershipAdministrationMock.makeAdmin.mockResolvedValue({
			status: 'updated',
			orgId: '11111111-1111-4111-8111-111111111111',
			targetUserId: '33333333-3333-4333-8333-333333333333'
		});
		platformMembershipAdministrationMock.transferOwnership.mockResolvedValue({
			status: 'updated',
			orgId: '11111111-1111-4111-8111-111111111111',
			fromUserId: '22222222-2222-4222-8222-222222222222',
			toUserId: '33333333-3333-4333-8333-333333333333'
		});
		platformAuditMock.listRecentByOrganization.mockResolvedValue([
			{
				id: 'audit-1',
				action: 'admin.org.extend_gift',
				userId: 'admin-1',
				timestamp: '2026-06-08T16:00:00.000Z',
				severity: 'info',
				resourceType: 'organization',
				resourceId: '11111111-1111-4111-8111-111111111111'
			}
		]);
	});

	it('rejects malformed organization IDs before calling the detail seam', async () => {
		await expect(
			load({
				__ctx: makeContext(makeOrgDetailLoadClient()),
				params: { orgId: 'not-a-uuid' }
			} as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid organization ID' }
		});

		expect(createPlatformOrganizationDetailMock).not.toHaveBeenCalled();
		expect(platformOrganizationDetailMock.getOrganizationDetail).not.toHaveBeenCalled();
	});

	it('returns found organization detail payloads unchanged through the detail seam', async () => {
		const adminClient = makeOrgDetailLoadClient();
		const ctx = makeContext(adminClient);
		const detail = makeOrgDetailLoadData();
		platformOrganizationDetailMock.getOrganizationDetail.mockResolvedValueOnce({ status: 'found', detail });

		const result = (await load({
			__ctx: ctx,
			params: { orgId: '11111111-1111-4111-8111-111111111111' }
		} as unknown as Parameters<typeof load>[0])) as unknown;

		expect(createPlatformOrganizationDetailMock).toHaveBeenCalledWith(ctx);
		expect(platformOrganizationDetailMock.getOrganizationDetail).toHaveBeenCalledWith(
			'11111111-1111-4111-8111-111111111111'
		);
		expect(result).toBe(detail);
		expect(adminClient.from).not.toHaveBeenCalled();
	});

	it('maps missing organization detail results to 404', async () => {
		platformOrganizationDetailMock.getOrganizationDetail.mockResolvedValueOnce({ status: 'not_found' });

		await expect(
			load({
				__ctx: makeContext(makeOrgDetailLoadClient()),
				params: { orgId: '11111111-1111-4111-8111-111111111111' }
			} as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({
			status: 404,
			body: { message: 'Organization not found' }
		});
	});

	it('maps provider failures to a sanitized 500', async () => {
		platformOrganizationDetailMock.getOrganizationDetail.mockResolvedValueOnce({
			status: 'provider_error',
			message: 'database offline'
		});

		try {
			await load({
				__ctx: makeContext(makeOrgDetailLoadClient()),
				params: { orgId: '11111111-1111-4111-8111-111111111111' }
			} as unknown as Parameters<typeof load>[0]);
			expect.unreachable('Expected load to throw');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(err).toMatchObject({
				status: 500,
				body: { message: 'Failed to load organization detail' }
			});
			expect(err).not.toMatchObject({
				body: { message: expect.stringContaining('database offline') }
			});
		}
	});

	it('routes gifting from the organization detail page through PlatformGifting', async () => {
		const ctx = makeContext(makeNoOrganizationGiftClient());

		const result = await actions.giftTier({
			__ctx: ctx,
			params: { orgId: 'org-1' },
			request: makeRequest({ giftTier: 'team', days: '30' })
		} as unknown as Parameters<(typeof actions)['giftTier']>[0]);

		expect(result).toEqual({ success: true });
		expect(platformGiftingMock.grantGift).toHaveBeenCalledWith({ orgId: 'org-1', giftTier: 'team', days: 30 });
	});

	it('rejects organization detail gift attempts below the current tier', async () => {
		const ctx = makeContext(makeNoOrganizationGiftClient());
		platformGiftingMock.grantGift.mockResolvedValueOnce({
			status: 'tier_below_current',
			currentTier: 'unit',
			giftTier: 'team'
		});

		const result = await actions.giftTier({
			__ctx: ctx,
			params: { orgId: 'org-1' },
			request: makeRequest({ giftTier: 'team', days: '30' })
		} as unknown as Parameters<(typeof actions)['giftTier']>[0]);

		expect(result).toEqual({
			status: 400,
			data: { error: { message: "Gift tier cannot be below the organization's current tier" } }
		});
	});

	it('routes ownership transfer through PlatformMembershipAdministration', async () => {
		const ctx = makeContext(makeNoMembershipAdministrationClient());

		const result = await actions.transferOwnership({
			__ctx: ctx,
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({
				targetUserId: '33333333-3333-4333-8333-333333333333',
				confirmName: 'Able Company'
			})
		} as unknown as Parameters<(typeof actions)['transferOwnership']>[0]);

		expect(result).toEqual({ success: true });
		expect(platformMembershipAdministrationMock.transferOwnership).toHaveBeenCalledWith({
			orgId: '11111111-1111-4111-8111-111111111111',
			targetUserId: '33333333-3333-4333-8333-333333333333',
			confirmName: 'Able Company'
		});
		expect(ctx.audit).not.toHaveBeenCalled();
	});

	it('routes make-admin role changes through PlatformMembershipAdministration', async () => {
		const ctx = makeContext(makeNoMembershipAdministrationClient());

		const result = await actions.makeAdmin({
			__ctx: ctx,
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({ targetUserId: '33333333-3333-4333-8333-333333333333' })
		} as unknown as Parameters<(typeof actions)['makeAdmin']>[0]);

		expect(result).toEqual({ success: true });
		expect(platformMembershipAdministrationMock.makeAdmin).toHaveBeenCalledWith({
			orgId: '11111111-1111-4111-8111-111111111111',
			targetUserId: '33333333-3333-4333-8333-333333333333'
		});
		expect(ctx.audit).not.toHaveBeenCalled();
	});

	it.each([
		['target_not_member', 'Target user is not a member of this organization'],
		['already_admin', 'Target user is already an admin'],
		['already_owner', 'Target user is already the owner']
	] as const)('returns a structured make-admin validation error for %s', async (status, message) => {
		platformMembershipAdministrationMock.makeAdmin.mockResolvedValueOnce({ status });

		const result = await actions.makeAdmin({
			__ctx: makeContext(makeNoMembershipAdministrationClient()),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({ targetUserId: '33333333-3333-4333-8333-333333333333' })
		} as unknown as Parameters<(typeof actions)['makeAdmin']>[0]);

		expect(result).toEqual({
			status: 400,
			data: { error: { message } }
		});
	});

	it('returns a structured error when make-admin role updates fail', async () => {
		platformMembershipAdministrationMock.makeAdmin.mockRejectedValueOnce(new Error('membership update failed'));

		const result = await actions.makeAdmin({
			__ctx: makeContext(makeNoMembershipAdministrationClient()),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({ targetUserId: '33333333-3333-4333-8333-333333333333' })
		} as unknown as Parameters<(typeof actions)['makeAdmin']>[0]);

		expect(result).toEqual({
			status: 500,
			data: { error: { message: 'Failed to update membership' } }
		});
	});

	it('returns a structured error when ownership transfer throws unexpectedly', async () => {
		platformMembershipAdministrationMock.transferOwnership.mockRejectedValueOnce(new Error('membership lookup failed'));

		const result = await actions.transferOwnership({
			__ctx: makeContext(makeNoMembershipAdministrationClient()),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({
				targetUserId: '33333333-3333-4333-8333-333333333333',
				confirmName: 'Able Company'
			})
		} as unknown as Parameters<(typeof actions)['transferOwnership']>[0]);

		expect(result).toEqual({
			status: 500,
			data: { error: { message: 'Transfer failed' } }
		});
	});

	it('preserves the ownership transfer promotion failure response', async () => {
		platformMembershipAdministrationMock.transferOwnership.mockResolvedValueOnce({ status: 'promotion_failed' });

		const result = await actions.transferOwnership({
			__ctx: makeContext(makeNoMembershipAdministrationClient()),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({
				targetUserId: '33333333-3333-4333-8333-333333333333',
				confirmName: 'Able Company'
			})
		} as unknown as Parameters<(typeof actions)['transferOwnership']>[0]);

		expect(result).toEqual({
			status: 500,
			data: { error: { message: 'Transfer failed during promotion' } }
		});
	});

	it('reports when the current owner cannot be verified during ownership transfer', async () => {
		platformMembershipAdministrationMock.transferOwnership.mockResolvedValueOnce({
			status: 'current_owner_lookup_failed'
		});

		const result = await actions.transferOwnership({
			__ctx: makeContext(makeNoMembershipAdministrationClient()),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({
				targetUserId: '33333333-3333-4333-8333-333333333333',
				confirmName: 'Able Company'
			})
		} as unknown as Parameters<(typeof actions)['transferOwnership']>[0]);

		expect(result).toEqual({
			status: 500,
			data: { error: { message: 'Could not verify current owner' } }
		});
	});

	it('reports when ownership transfer rollback needs manual recovery', async () => {
		platformMembershipAdministrationMock.transferOwnership.mockResolvedValueOnce({ status: 'rollback_failed' });

		const result = await actions.transferOwnership({
			__ctx: makeContext(makeNoMembershipAdministrationClient()),
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({
				targetUserId: '33333333-3333-4333-8333-333333333333',
				confirmName: 'Able Company'
			})
		} as unknown as Parameters<(typeof actions)['transferOwnership']>[0]);

		expect(result).toEqual({
			status: 500,
			data: {
				error: { message: 'Transfer failed during promotion; original owner could not be restored automatically' }
			}
		});
	});

	it('routes gift revocation from the organization detail page through PlatformGifting', async () => {
		const result = await actions.revokeGift({
			__ctx: makeContext(makeNoOrganizationGiftClient()),
			params: { orgId: 'org-1' },
			request: makeRequest({})
		} as unknown as Parameters<(typeof actions)['revokeGift']>[0]);

		expect(result).toEqual({ success: true });
		expect(platformGiftingMock.revokeGift).toHaveBeenCalledWith('org-1');
	});

	it('reports gift revocation attempts when no active gift exists', async () => {
		platformGiftingMock.revokeGift.mockResolvedValueOnce({ status: 'no_active_gift' });

		const result = await actions.revokeGift({
			__ctx: makeContext(makeNoOrganizationGiftClient()),
			params: { orgId: 'org-1' },
			request: makeRequest({})
		} as unknown as Parameters<(typeof actions)['revokeGift']>[0]);

		expect(result).toEqual({
			status: 400,
			data: { error: { message: 'Organization does not have an active gift' } }
		});
	});

	it('routes gift extension from the organization detail page through PlatformGifting', async () => {
		const result = await actions.extendGift({
			__ctx: makeContext(makeNoOrganizationGiftClient()),
			params: { orgId: 'org-1' },
			request: makeRequest({ days: '15' })
		} as unknown as Parameters<(typeof actions)['extendGift']>[0]);

		expect(result).toEqual({ success: true });
		expect(platformGiftingMock.extendGift).toHaveBeenCalledWith({ orgId: 'org-1', days: 15 });
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

	it('allows manual billing reconciliation for support admins', async () => {
		const adminClient = makeAdminClient({ id: 'org-1' });
		const ctx = makeContext(adminClient.client, 'support');

		const result = await actions.reconcileBilling({
			__ctx: ctx,
			params: { orgId: '11111111-1111-4111-8111-111111111111' },
			request: makeRequest({})
		} as unknown as Parameters<(typeof actions)['reconcileBilling']>[0]);

		expect(result).toMatchObject({
			billingReconciliation: expect.objectContaining({
				success: true,
				status: 'repaired'
			})
		});
		expect(reconcileOrganizationBillingMock).toHaveBeenCalledOnce();
		expect(ctx.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.org.billing_reconcile' }));
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
