import { describe, expect, it } from 'vitest';
import type { BillingSnapshot } from '$lib/types/subscription';
import type { OrganizationPlanUsage } from './organizationPlanUsage';
import { buildPlanAdminDiagnostics } from './planAdminDiagnostics';
import { buildPlanDowngradePreview } from './planDowngradePreview';
import { buildEffectivePlanPolicy, type PlanPolicySource } from './planPolicy';
import { planPolicySourceLabel } from './planPolicySourceLabel';
import { buildPlanUsageSummary } from './planUsageSummary';

const expectedLabels: Record<PlanPolicySource, string> = {
	admin_gift: 'Admin gift',
	billing_disabled_fallback: 'Billing-disabled fallback',
	billing_snapshot: 'Stripe-backed billing',
	legacy_organization: 'Legacy organization'
};

function snapshot(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
	return {
		organizationId: 'org-1',
		source: 'stripe',
		commercialPlan: 'team',
		stripeCustomerId: 'cus_123',
		stripeSubscriptionId: 'sub_123',
		stripeProductId: 'prod_team',
		stripePriceId: 'price_team',
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

function usage(): OrganizationPlanUsage {
	return {
		organizationId: 'org-1',
		asOf: '2026-05-24T12:00:00.000Z',
		activePersonnelCount: 12,
		activeOrganizationMemberCount: 1,
		pendingUnexpiredInvitationCount: 0,
		monthlyExportCount: 1,
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
	};
}

function snapshotForSource(source: PlanPolicySource): BillingSnapshot {
	switch (source) {
		case 'admin_gift':
			return snapshot({
				source: 'gift',
				commercialPlan: 'free',
				giftTier: 'unit',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			});
		case 'billing_disabled_fallback':
			return snapshot({
				source: 'billing_disabled',
				commercialPlan: 'unit',
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				stripeProductId: null,
				stripePriceId: null,
				subscriptionStatus: null,
				collectionStatus: null,
				syncStatus: 'billing_disabled'
			});
		case 'billing_snapshot':
			return snapshot();
		case 'legacy_organization':
			return snapshot({
				source: 'legacy_organization',
				commercialPlan: 'team',
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				stripeProductId: null,
				stripePriceId: null,
				subscriptionStatus: null,
				collectionStatus: null,
				syncStatus: 'needs_reconciliation'
			});
	}
}

describe('plan policy source labels', () => {
	it('maps every policy source to the shared billing label copy', () => {
		expect(
			Object.fromEntries(
				Object.keys(expectedLabels).map((source) => [source, planPolicySourceLabel(source as PlanPolicySource)])
			)
		).toEqual(expectedLabels);
	});

	it('keeps diagnostics, usage summaries, and downgrade previews on the shared source label', () => {
		for (const [source, expectedLabel] of Object.entries(expectedLabels) as [PlanPolicySource, string][]) {
			const policy = buildEffectivePlanPolicy(snapshotForSource(source));
			const planUsage = usage();
			const diagnostics = buildPlanAdminDiagnostics(policy, planUsage);
			const summary = buildPlanUsageSummary(policy, planUsage);
			const preview = buildPlanDowngradePreview({ currentPolicy: policy, targetPolicy: policy, usage: planUsage });

			expect(policy.source).toBe(source);
			expect(diagnostics.effectivePlan.sourceLabel).toBe(expectedLabel);
			expect(summary.plan.sourceLabel).toBe(expectedLabel);
			expect(preview.currentPlan.sourceLabel).toBe(expectedLabel);
			expect(preview.targetPlan.sourceLabel).toBe(expectedLabel);
		}
	});
});
