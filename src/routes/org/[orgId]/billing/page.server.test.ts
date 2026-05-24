import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';

const {
	readBillingOrganizationMock,
	canManageBillingSubscriptionMock,
	readCurrentBillingSnapshotMock,
	readEffectivePlanPolicyMock,
	readOrganizationPlanUsageMock
} = vi.hoisted(() => ({
	readBillingOrganizationMock: vi.fn(),
	canManageBillingSubscriptionMock: vi.fn(),
	readCurrentBillingSnapshotMock: vi.fn(),
	readEffectivePlanPolicyMock: vi.fn(),
	readOrganizationPlanUsageMock: vi.fn()
}));

vi.mock('$lib/server/core/useCases/billingOrganization', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/billingOrganization')>(
		'$lib/server/core/useCases/billingOrganization'
	);

	return {
		...actual,
		readBillingOrganization: readBillingOrganizationMock,
		canManageBillingSubscription: canManageBillingSubscriptionMock
	};
});

vi.mock('$lib/server/core/useCases/billingState', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/billingState')>(
		'$lib/server/core/useCases/billingState'
	);

	return {
		...actual,
		readCurrentBillingSnapshot: readCurrentBillingSnapshotMock
	};
});

vi.mock('$lib/server/core/useCases/planPolicy', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/planPolicy')>(
		'$lib/server/core/useCases/planPolicy'
	);

	return {
		...actual,
		readEffectivePlanPolicy: readEffectivePlanPolicyMock
	};
});

vi.mock('$lib/server/core/useCases/organizationPlanUsage', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/organizationPlanUsage')>(
		'$lib/server/core/useCases/organizationPlanUsage'
	);

	return {
		...actual,
		readOrganizationPlanUsage: readOrganizationPlanUsageMock
	};
});

import { _loadBillingPageData } from './+page.server';
import { buildEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import type { BillingSnapshot } from '$lib/types/subscription';

function snapshot(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
	return {
		organizationId: 'org-1',
		source: 'stripe',
		commercialPlan: 'free',
		stripeCustomerId: 'cus_123',
		stripeSubscriptionId: 'sub_123',
		stripeProductId: 'prod_free',
		stripePriceId: 'price_free',
		subscriptionStatus: 'active',
		collectionStatus: 'current',
		currentPeriodStart: '2026-05-01T00:00:00.000Z',
		currentPeriodEnd: '2026-06-01T00:00:00.000Z',
		cancelAtPeriodEnd: false,
		canceledAt: null,
		trialEnd: null,
		syncStatus: 'synced',
		lastStripeEventId: 'evt_123',
		lastStripeEventType: 'customer.subscription.updated',
		lastStripeEventCreatedAt: '2026-05-01T00:01:00.000Z',
		lastProcessedAt: '2026-05-01T00:02:00.000Z',
		lastReconciledAt: null,
		reconciliationResult: null,
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null,
		...overrides
	};
}

describe('_loadBillingPageData', () => {
	beforeEach(() => {
		readBillingOrganizationMock.mockReset();
		canManageBillingSubscriptionMock.mockReset();
		readCurrentBillingSnapshotMock.mockReset();
		readEffectivePlanPolicyMock.mockReset();
		readOrganizationPlanUsageMock.mockReset();
		readEffectivePlanPolicyMock.mockResolvedValue(buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' })));
		readOrganizationPlanUsageMock.mockResolvedValue({
			organizationId: 'org-1',
			asOf: '2026-05-24T12:00:00.000Z',
			activePersonnelCount: 20,
			activeOrganizationMemberCount: 1,
			pendingUnexpiredInvitationCount: 0,
			monthlyExportCount: 0,
			sources: {
				activePersonnel: { table: 'personnel', included: [], excluded: [] },
				activeOrganizationMembers: { table: 'organization_memberships', included: [], excluded: [] },
				pendingUnexpiredInvitations: { table: 'organization_invitations', included: [], excluded: [] },
				monthlyExports: {
					table: 'data_exports',
					included: [],
					excluded: [],
					period: {
						start: '2026-05-01T00:00:00.000Z',
						endExclusive: '2026-06-01T00:00:00.000Z'
					}
				}
			}
		});
	});

	it('denies non-owner billing access before reading billing organization details', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin'
			}
		});

		await expect(
			_loadBillingPageData(ctx, {
				tier: 'team',
				source: 'subscription',
				personnelCount: 20,
				personnelCap: 75,
				isReadOnly: false,
				readOnlyReason: null,
				giftExpiresAt: null,
				giftTier: null
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(readBillingOrganizationMock).not.toHaveBeenCalled();
		expect(readCurrentBillingSnapshotMock).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.accessBilling',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('derives subscription management state from the app-owned billing helper', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'owner'
			}
		});
		readBillingOrganizationMock.mockResolvedValue({
			name: 'Alpha Company',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			subscriptionStatus: 'active'
		});
		readCurrentBillingSnapshotMock.mockResolvedValue({
			organizationId: 'org-1',
			source: 'stripe',
			commercialPlan: 'team',
			subscriptionStatus: 'active',
			cancelAtPeriodEnd: true,
			currentPeriodEnd: '2026-06-01T00:00:00.000Z',
			canceledAt: null
		});
		canManageBillingSubscriptionMock.mockReturnValue(true);

		const result = await _loadBillingPageData(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				rawStore: { kind: 'raw-store' } as never
			},
			{
				tier: 'team',
				source: 'subscription',
				personnelCount: 20,
				personnelCap: 75,
				isReadOnly: false,
				readOnlyReason: null,
				giftExpiresAt: null,
				giftTier: null
			}
		);

		expect(readBillingOrganizationMock).toHaveBeenCalledWith({
			auth: expect.objectContaining({ orgId: 'org-1', role: 'owner' }),
			store: { kind: 'raw-store' }
		});
		expect(canManageBillingSubscriptionMock).toHaveBeenCalledWith({
			name: 'Alpha Company',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			subscriptionStatus: 'active'
		});
		expect(readCurrentBillingSnapshotMock).toHaveBeenCalledWith({
			auth: expect.objectContaining({ orgId: 'org-1', role: 'owner' }),
			store: { kind: 'raw-store' }
		});
		expect(result).toEqual(
			expect.objectContaining({
				orgName: 'Alpha Company',
				stripeCustomerId: 'cus_123',
				subscriptionStripeId: 'sub_123',
				billingSnapshot: {
					organizationId: 'org-1',
					source: 'stripe',
					commercialPlan: 'team',
					subscriptionStatus: 'active',
					cancelAtPeriodEnd: true,
					currentPeriodEnd: '2026-06-01T00:00:00.000Z',
					canceledAt: null
				},
				cancellationSummary: {
					state: 'canceling_at_period_end',
					label: 'Cancels at period end',
					description:
						'Paid access remains active until the paid-through date unless Stripe reports an earlier terminal state.',
					currentPeriodEnd: '2026-06-01T00:00:00.000Z',
					canceledAt: null
				},
				canManageSubscription: true
			})
		);
	});

	it('loads policy-backed usage and limits for owner remediation copy', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'owner'
			}
		});
		const billingSnapshot = snapshot();
		readBillingOrganizationMock.mockResolvedValue({
			name: 'Alpha Company',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			subscriptionStatus: 'active'
		});
		readCurrentBillingSnapshotMock.mockResolvedValue(billingSnapshot);
		readEffectivePlanPolicyMock.mockResolvedValue(buildEffectivePlanPolicy(billingSnapshot));
		readOrganizationPlanUsageMock.mockResolvedValue({
			organizationId: 'org-1',
			asOf: '2026-05-24T12:00:00.000Z',
			activePersonnelCount: 21,
			activeOrganizationMemberCount: 1,
			pendingUnexpiredInvitationCount: 1,
			monthlyExportCount: 3,
			sources: {
				activePersonnel: { table: 'personnel', included: [], excluded: [] },
				activeOrganizationMembers: { table: 'organization_memberships', included: [], excluded: [] },
				pendingUnexpiredInvitations: { table: 'organization_invitations', included: [], excluded: [] },
				monthlyExports: {
					table: 'data_exports',
					included: [],
					excluded: [],
					period: {
						start: '2026-05-01T00:00:00.000Z',
						endExclusive: '2026-06-01T00:00:00.000Z'
					}
				}
			}
		});
		canManageBillingSubscriptionMock.mockReturnValue(true);

		const result = await _loadBillingPageData(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				rawStore: { kind: 'raw-store' } as never
			},
			{
				tier: 'free',
				source: 'subscription',
				personnelCount: 21,
				personnelCap: 20,
				isReadOnly: true,
				readOnlyReason: 'personnel_limit',
				giftExpiresAt: null,
				giftTier: null
			}
		);

		expect(readEffectivePlanPolicyMock).toHaveBeenCalledWith({
			auth: expect.objectContaining({ orgId: 'org-1', role: 'owner' }),
			store: { kind: 'raw-store' }
		});
		expect(readOrganizationPlanUsageMock).toHaveBeenCalledWith({
			auth: expect.objectContaining({ orgId: 'org-1', role: 'owner' }),
			store: { kind: 'raw-store' }
		});
		expect(result.planUsageSummary).toMatchObject({
			plan: {
				sourceLabel: 'Stripe-backed billing'
			},
			rows: [
				expect.objectContaining({ dimension: 'active_personnel', used: 21, limit: 20, status: 'over_limit' }),
				expect.objectContaining({ dimension: 'active_organization_members', used: 1, limit: 2 }),
				expect.objectContaining({ dimension: 'pending_invitations', status: 'limit_reached' }),
				expect.objectContaining({ dimension: 'monthly_exports', status: 'limit_reached' })
			]
		});
	});
});
