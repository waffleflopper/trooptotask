import { describe, expect, it } from 'vitest';
import type { BillingSnapshot } from '$lib/types/subscription';
import { buildEffectivePlanPolicy } from './planPolicy';
import type { OrganizationPlanUsage } from './organizationPlanUsage';
import { buildPlanUsageSummary } from './planUsageSummary';

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
		cancellationReason: null,
		cancellationFeedback: null,
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

function usage(overrides: Partial<OrganizationPlanUsage> = {}): OrganizationPlanUsage {
	return {
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
		},
		...overrides
	};
}

describe('plan usage summary', () => {
	it('distinguishes owner-facing over-limit reasons from policy and usage data', () => {
		const policy = buildEffectivePlanPolicy(snapshot());

		const summary = buildPlanUsageSummary(policy, usage());

		expect(summary).toMatchObject({
			plan: {
				tier: 'free',
				source: 'billing_snapshot',
				sourceLabel: 'Paid subscription'
			},
			rows: [
				expect.objectContaining({
					dimension: 'active_personnel',
					used: 21,
					limit: 20,
					status: 'over_limit',
					remediation: 'Archive personnel or upgrade to Team.'
				}),
				expect.objectContaining({
					dimension: 'active_organization_members',
					used: 1,
					limit: 2,
					status: 'within_limit'
				}),
				expect.objectContaining({
					dimension: 'pending_invitations',
					used: 1,
					limit: 2,
					status: 'limit_reached',
					remediation: 'Revoke pending invitations or upgrade to Team.'
				}),
				expect.objectContaining({
					dimension: 'monthly_exports',
					used: 3,
					limit: 3,
					status: 'limit_reached',
					remediation: 'Upgrade for unlimited exports or wait until next month.'
				})
			],
			alerts: [
				expect.objectContaining({ dimension: 'active_personnel' }),
				expect.objectContaining({ dimension: 'pending_invitations' }),
				expect.objectContaining({ dimension: 'monthly_exports' })
			]
		});
	});

	it('explains gift, billing-disabled, and read-only billing sources for owners', () => {
		const gifted = buildPlanUsageSummary(
			buildEffectivePlanPolicy(
				snapshot({
					source: 'gift',
					commercialPlan: 'unit',
					giftTier: 'unit',
					giftExpiresAt: '2999-01-01T00:00:00.000Z'
				})
			),
			usage({
				activePersonnelCount: 4,
				activeOrganizationMemberCount: 1,
				pendingUnexpiredInvitationCount: 0,
				monthlyExportCount: 0
			})
		);
		const billingDisabled = buildPlanUsageSummary(
			buildEffectivePlanPolicy(
				snapshot({
					source: 'billing_disabled',
					commercialPlan: 'unit',
					stripeCustomerId: null,
					stripeSubscriptionId: null,
					stripeProductId: null,
					stripePriceId: null,
					subscriptionStatus: null,
					collectionStatus: null,
					syncStatus: 'billing_disabled'
				})
			),
			usage({
				activePersonnelCount: 4,
				activeOrganizationMemberCount: 1,
				pendingUnexpiredInvitationCount: 0,
				monthlyExportCount: 0
			})
		);
		const paymentGrace = buildPlanUsageSummary(
			buildEffectivePlanPolicy(
				snapshot({
					commercialPlan: 'team',
					subscriptionStatus: 'past_due',
					collectionStatus: 'payment_failed_grace'
				})
			),
			usage({
				activePersonnelCount: 4,
				activeOrganizationMemberCount: 1,
				pendingUnexpiredInvitationCount: 0,
				monthlyExportCount: 0
			})
		);

		expect(gifted.plan.sourceLabel).toBe('Admin gift');
		expect(billingDisabled.plan.sourceLabel).toBe('Billing-disabled fallback');
		expect(billingDisabled.rows.map((row) => row.limitLabel)).toEqual([
			'Unlimited',
			'Unlimited',
			'Unlimited',
			'Unlimited'
		]);
		expect(paymentGrace.alerts).toContainEqual(
			expect.objectContaining({
				dimension: 'billing_state',
				status: 'read_only',
				remediation: 'Update the payment method or contact support.'
			})
		);
	});

	it('marks add-blocking personnel and member caps as limit reached', () => {
		const policy = buildEffectivePlanPolicy(snapshot());

		const summary = buildPlanUsageSummary(
			policy,
			usage({
				activePersonnelCount: 20,
				activeOrganizationMemberCount: 2,
				pendingUnexpiredInvitationCount: 0,
				monthlyExportCount: 0
			})
		);

		expect(summary.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ dimension: 'active_personnel', status: 'limit_reached' }),
				expect.objectContaining({ dimension: 'active_organization_members', status: 'limit_reached' })
			])
		);
		expect(summary.alerts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ dimension: 'active_personnel', status: 'limit_reached' }),
				expect.objectContaining({ dimension: 'active_organization_members', status: 'limit_reached' })
			])
		);
	});
});
