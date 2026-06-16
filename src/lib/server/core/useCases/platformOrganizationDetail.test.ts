import { describe, expect, it, vi } from 'vitest';
import {
	createPlatformOrganizationDetail,
	type PlatformOrganizationDetailDependencies,
	type PlatformOrganizationDetailOrganizationRow,
	type PlatformOrganizationDetailStore
} from './platformOrganizationDetail';
import type { PlatformAudit } from './platformAudit';
import type { PlatformGiftOrganization, PlatformGifting } from './platformGifting';
import type { PlatformMembershipAdministration } from './platformMembershipAdministration';
import type { PlatformOrganizationMember } from './platformMembershipAdministration';
import type { PlatformMetrics } from './platformMetrics';
import type { PlanAdminDiagnostics } from './planAdminDiagnostics';
import type { EffectivePlanPolicy } from './planPolicy';
import type { BillingSnapshot } from '$lib/types/subscription';

function organization(overrides: Partial<PlatformOrganizationDetailOrganizationRow> = {}) {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Able Company',
		tier: 'team',
		gift_tier: null,
		gift_expires_at: null,
		suspended_at: null,
		created_at: '2026-06-01T00:00:00.000Z',
		...overrides
	} satisfies PlatformOrganizationDetailOrganizationRow;
}

function billingSnapshot(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
	return {
		organizationId: '11111111-1111-4111-8111-111111111111',
		source: 'stripe',
		commercialPlan: 'team',
		stripeCustomerId: 'cus_secret',
		stripeSubscriptionId: 'sub_secret',
		stripeProductId: 'prod_secret',
		stripePriceId: 'price_secret',
		subscriptionStatus: 'active',
		collectionStatus: null,
		currentPeriodStart: null,
		currentPeriodEnd: null,
		cancelAtPeriodEnd: false,
		canceledAt: null,
		cancellationReason: null,
		cancellationFeedback: null,
		trialEnd: null,
		syncStatus: 'synced',
		lastStripeEventId: 'evt_secret',
		lastStripeEventType: 'customer.subscription.updated',
		lastStripeEventCreatedAt: '2026-06-01T00:00:00.000Z',
		lastProcessedAt: '2026-06-01T00:01:00.000Z',
		lastReconciledAt: '2026-06-01T00:02:00.000Z',
		reconciliationResult: null,
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null,
		...overrides
	};
}

function planDiagnostics(overrides: Partial<PlanAdminDiagnostics> = {}): PlanAdminDiagnostics {
	return {
		effectivePlan: {
			commercialPlan: 'team',
			tier: 'team',
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
		entitlements: [],
		...overrides
	};
}

function planPolicy(): EffectivePlanPolicy {
	return {
		commercialPlan: 'team',
		tier: 'team',
		source: 'legacy_organization',
		billingSource: 'legacy_organization',
		giftTier: null,
		giftExpiresAt: null,
		grace: { mode: 'none', message: null },
		readOnly: { enabled: false, reasons: [] },
		entitlements: {
			bulk_export_unlimited: {
				key: 'bulk_export_unlimited',
				label: 'Unlimited bulk exports',
				description: 'Detailed reports',
				available: true,
				source: 'base_plan',
				upgradeTarget: null
			}
		}
	} as unknown as EffectivePlanPolicy;
}

function makeDependencies(
	overrides: Partial<PlatformOrganizationDetailDependencies> = {}
): PlatformOrganizationDetailDependencies {
	const store: PlatformOrganizationDetailStore = {
		getOrganizationById: vi.fn(async () => organization()),
		getBillingSnapshotByOrganization: vi.fn(async () => billingSnapshot())
	};
	const gifting: PlatformGifting = {
		listOrganizations: vi.fn(),
		getOrganizationGiftState: vi.fn(
			async () =>
				({
					id: '11111111-1111-4111-8111-111111111111',
					name: 'Able Company',
					tier: 'team',
					giftTier: null,
					giftExpiresAt: null,
					giftedBy: null,
					stripeSubscriptionId: null,
					subscriptionStatus: null,
					stripeCustomerId: null
				}) satisfies PlatformGiftOrganization
		),
		grantGift: vi.fn(),
		revokeGift: vi.fn(),
		extendGift: vi.fn()
	};
	const membershipAdministration: PlatformMembershipAdministration = {
		listMembers: vi.fn(
			async (): Promise<PlatformOrganizationMember[]> => [
				{ userId: 'owner-1', email: 'owner@example.com', role: 'owner' },
				{ userId: 'member-1', email: null, role: 'member' }
			]
		),
		makeAdmin: vi.fn(),
		transferOwnership: vi.fn()
	};
	const metrics: PlatformMetrics = {
		countMembershipsByOrganization: vi.fn(),
		countActivePersonnelByOrganization: vi.fn(),
		countActivePersonnelForOrganization: vi.fn(async () => 7),
		getOwnerMembershipsByOrganization: vi.fn(),
		getOrganizationMetrics: vi.fn()
	};
	const audit: PlatformAudit = {
		listLogs: vi.fn(),
		listRecentByOrganization: vi.fn(async () => [
			{
				id: 'audit-1',
				action: 'admin.org.extend_gift',
				userId: 'admin-1',
				timestamp: '2026-06-08T16:00:00.000Z',
				severity: 'info',
				resourceType: 'organization',
				resourceId: '11111111-1111-4111-8111-111111111111'
			}
		]),
		listRecentByUser: vi.fn()
	};

	return {
		store,
		adminRole: 'super_admin',
		gifting,
		membershipAdministration,
		metrics,
		audit,
		readPlanContext: vi.fn(async () => ({
			planPolicy: planPolicy(),
			planDiagnostics: planDiagnostics()
		})),
		logError: vi.fn(),
		...overrides
	};
}

describe('createPlatformOrganizationDetail', () => {
	it('maps the current organization detail load payload shape', async () => {
		const deps = makeDependencies();
		const detail = createPlatformOrganizationDetail(deps);

		const result = await detail.getOrganizationDetail('11111111-1111-4111-8111-111111111111');

		expect(result).toMatchObject({
			status: 'found',
			detail: {
				adminRole: 'super_admin',
				org: {
					id: '11111111-1111-4111-8111-111111111111',
					name: 'Able Company',
					subscriptionTier: 'team',
					giftTier: null,
					giftExpiresAt: null,
					suspendedAt: null,
					createdAt: '2026-06-01T00:00:00.000Z',
					effectiveTier: 'team',
					isSuspended: false
				},
				members: [
					{ userId: 'owner-1', email: 'owner@example.com', role: 'owner' },
					{ userId: 'member-1', email: '(unknown)', role: 'member' }
				],
				personnelCount: 7,
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
				],
				planPolicy: {
					source: 'legacy_organization',
					billingSource: 'legacy_organization',
					entitlements: [expect.objectContaining({ key: 'bulk_export_unlimited' })]
				},
				planDiagnostics: expect.objectContaining({
					effectivePlan: expect.objectContaining({ commercialPlan: 'team' })
				}),
				cancellationSummary: {
					state: 'none',
					label: 'Not scheduled',
					currentPeriodEnd: null,
					canceledAt: null
				}
			}
		});
	});

	it('defaults nullable legacy subscription tiers to free', async () => {
		const deps = makeDependencies({
			store: {
				getOrganizationById: vi.fn(async () => organization({ tier: null })),
				getBillingSnapshotByOrganization: vi.fn(async () => null)
			}
		});

		const result = await createPlatformOrganizationDetail(deps).getOrganizationDetail(
			'11111111-1111-4111-8111-111111111111'
		);

		expect(result).toMatchObject({
			status: 'found',
			detail: {
				org: {
					subscriptionTier: 'free',
					effectiveTier: 'free'
				}
			}
		});
	});

	it('returns not_found when the organization does not exist', async () => {
		const deps = makeDependencies({
			store: {
				getOrganizationById: vi.fn(async () => null),
				getBillingSnapshotByOrganization: vi.fn(async () => billingSnapshot())
			}
		});

		await expect(
			createPlatformOrganizationDetail(deps).getOrganizationDetail('11111111-1111-4111-8111-111111111111')
		).resolves.toEqual({ status: 'not_found' });
		expect(deps.gifting.getOrganizationGiftState).not.toHaveBeenCalled();
	});

	it('returns provider_error for true provider read failures', async () => {
		const deps = makeDependencies({
			store: {
				getOrganizationById: vi.fn(async () => {
					throw new Error('database unavailable');
				}),
				getBillingSnapshotByOrganization: vi.fn()
			}
		});

		await expect(
			createPlatformOrganizationDetail(deps).getOrganizationDetail('11111111-1111-4111-8111-111111111111')
		).resolves.toEqual({ status: 'provider_error', message: 'database unavailable' });
	});

	it('treats a missing billing snapshot as an absent snapshot rather than an error', async () => {
		const deps = makeDependencies({
			store: {
				getOrganizationById: vi.fn(async () => organization()),
				getBillingSnapshotByOrganization: vi.fn(async () => null)
			}
		});

		const result = await createPlatformOrganizationDetail(deps).getOrganizationDetail(
			'11111111-1111-4111-8111-111111111111'
		);

		expect(result).toMatchObject({
			status: 'found',
			detail: {
				billingSnapshot: null,
				cancellationSummary: null
			}
		});
	});

	it('redacts billing snapshot provider identifiers for support admins', async () => {
		const supportResult = await createPlatformOrganizationDetail(
			makeDependencies({ adminRole: 'support' })
		).getOrganizationDetail('11111111-1111-4111-8111-111111111111');
		const superAdminResult = await createPlatformOrganizationDetail(
			makeDependencies({ adminRole: 'super_admin' })
		).getOrganizationDetail('11111111-1111-4111-8111-111111111111');

		expect(supportResult).toMatchObject({
			status: 'found',
			detail: {
				billingSnapshot: {
					stripeCustomerId: null,
					stripeSubscriptionId: null,
					stripeProductId: null,
					stripePriceId: null,
					lastStripeEventId: null,
					lastStripeEventType: null,
					lastStripeEventCreatedAt: null,
					lastProcessedAt: null
				}
			}
		});
		expect(superAdminResult).toMatchObject({
			status: 'found',
			detail: {
				billingSnapshot: {
					stripeCustomerId: 'cus_secret',
					stripeSubscriptionId: 'sub_secret',
					lastStripeEventId: 'evt_secret'
				}
			}
		});
	});

	it('falls back to the loaded organization gift columns when gift-state reads fail', async () => {
		const logError = vi.fn();
		const deps = makeDependencies({
			store: {
				getOrganizationById: vi.fn(async () =>
					organization({ tier: 'free', gift_tier: 'unit', gift_expires_at: '2026-07-01T00:00:00.000Z' })
				),
				getBillingSnapshotByOrganization: vi.fn(async () => null)
			},
			logError
		});
		vi.mocked(deps.gifting.getOrganizationGiftState).mockRejectedValueOnce(new Error('gift state unavailable'));

		const result = await createPlatformOrganizationDetail(deps).getOrganizationDetail(
			'11111111-1111-4111-8111-111111111111'
		);

		expect(logError).toHaveBeenCalledWith('[admin/organizations] Failed to load gift state:', expect.any(Error));
		expect(result).toMatchObject({
			status: 'found',
			detail: {
				org: {
					giftTier: 'unit',
					giftExpiresAt: '2026-07-01T00:00:00.000Z',
					effectiveTier: 'unit'
				}
			}
		});
	});

	it('preserves cancellation summary from the visible billing snapshot', async () => {
		const deps = makeDependencies({
			store: {
				getOrganizationById: vi.fn(async () => organization()),
				getBillingSnapshotByOrganization: vi.fn(async () =>
					billingSnapshot({
						cancelAtPeriodEnd: true,
						currentPeriodEnd: '2026-07-01T00:00:00.000Z'
					})
				)
			},
			readPlanContext: vi.fn(async () => ({
				planPolicy: planPolicy(),
				planDiagnostics: planDiagnostics({ overLimitReasons: [{ label: 'Personnel' } as never] })
			}))
		});

		const result = await createPlatformOrganizationDetail(deps).getOrganizationDetail(
			'11111111-1111-4111-8111-111111111111'
		);

		expect(result).toMatchObject({
			status: 'found',
			detail: {
				planDiagnostics: {
					overLimitReasons: [{ label: 'Personnel' }]
				},
				cancellationSummary: {
					state: 'canceling_at_period_end',
					currentPeriodEnd: '2026-07-01T00:00:00.000Z'
				}
			}
		});
	});
});
