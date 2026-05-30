import { describe, expect, it } from 'vitest';
import type { BillingSnapshot } from '$lib/types/subscription';
import { buildEffectivePlanPolicy } from './planPolicy';
import type { OrganizationPlanUsage } from './organizationPlanUsage';
import { buildPlanAdminDiagnostics } from './planAdminDiagnostics';

function snapshot(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
	return {
		organizationId: 'org-1',
		source: 'stripe',
		commercialPlan: 'team',
		stripeCustomerId: 'cus_secret',
		stripeSubscriptionId: 'sub_secret',
		stripeProductId: 'prod_secret',
		stripePriceId: 'price_secret',
		subscriptionStatus: 'past_due',
		collectionStatus: 'payment_failed_grace',
		currentPeriodStart: '2026-05-01T00:00:00.000Z',
		currentPeriodEnd: '2026-06-01T00:00:00.000Z',
		cancelAtPeriodEnd: false,
		canceledAt: null,
		cancellationReason: null,
		cancellationFeedback: null,
		trialEnd: null,
		syncStatus: 'synced',
		lastStripeEventId: 'evt_secret',
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
		activePersonnelCount: 12,
		activeOrganizationMemberCount: 11,
		pendingUnexpiredInvitationCount: 1,
		monthlyExportCount: 2,
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

describe('plan admin diagnostics', () => {
	it('summarizes effective policy, usage rows, blockers, and entitlement sources without raw provider payloads', () => {
		const policy = buildEffectivePlanPolicy(snapshot(), {
			featureOverrides: [
				{
					id: 'override-1',
					organizationId: 'org-1',
					featureKey: 'advanced_reporting',
					state: 'granted',
					expiresAt: null
				}
			]
		});

		const diagnostics = buildPlanAdminDiagnostics(policy, usage());

		expect(diagnostics.effectivePlan).toEqual({
			commercialPlan: 'team',
			tier: 'team',
			source: 'billing_snapshot',
			sourceLabel: 'Stripe-backed billing',
			billingSource: 'stripe',
			giftTier: null,
			giftExpiresAt: null
		});
		expect(diagnostics.grace).toEqual({
			mode: 'payment_failed',
			message: 'Payment failed grace mode keeps the current plan visible while write access can be restricted.'
		});
		expect(diagnostics.readOnly).toMatchObject({
			enabled: true,
			reasons: [
				expect.objectContaining({
					dimension: 'billing_state',
					label: 'Billing state',
					sourceLabel: 'Stripe-backed billing'
				})
			]
		});
		expect(diagnostics.usageRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					dimension: 'active_personnel',
					label: 'Personnel',
					used: 12,
					limit: 80,
					status: 'within_limit'
				}),
				expect.objectContaining({
					dimension: 'active_organization_members',
					label: 'Members',
					used: 11,
					limit: null,
					status: 'within_limit'
				}),
				expect.objectContaining({
					dimension: 'pending_invitations',
					label: 'Pending invitations',
					status: 'within_limit',
					message: 'Pending invitations use 1 seat; 12 of Unlimited member seats are reserved.'
				}),
				expect.objectContaining({
					dimension: 'monthly_exports',
					label: 'Monthly exports',
					limit: 10,
					status: 'within_limit'
				})
			])
		);
		expect(diagnostics.overLimitReasons.map((reason) => reason.label)).toEqual(['Billing state']);
		expect(diagnostics.entitlements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: 'bulk_export_unlimited',
					label: 'Unlimited bulk exports',
					available: false,
					sourceLabel: 'Paid plan',
					upgradeTarget: 'unit'
				}),
				expect.objectContaining({
					key: 'advanced_reporting',
					label: 'Advanced reporting',
					available: true,
					sourceLabel: 'Feature override',
					override: {
						id: 'override-1',
						state: 'granted',
						expiresAt: null
					}
				})
			])
		);
		expect(JSON.stringify(diagnostics)).not.toContain('cus_secret');
		expect(JSON.stringify(diagnostics)).not.toContain('sub_secret');
		expect(JSON.stringify(diagnostics)).not.toContain('price_secret');
		expect(JSON.stringify(diagnostics)).not.toContain('evt_secret');
	});

	it('shows shared policy source labels for gift, billing-disabled, and legacy organizations', () => {
		const giftDiagnostics = buildPlanAdminDiagnostics(
			buildEffectivePlanPolicy(
				snapshot({
					source: 'gift',
					commercialPlan: 'free',
					giftTier: 'unit',
					giftExpiresAt: '2026-06-01T00:00:00.000Z',
					subscriptionStatus: 'active',
					collectionStatus: 'current'
				})
			),
			usage({ activeOrganizationMemberCount: 1, pendingUnexpiredInvitationCount: 0 })
		);
		const fallbackDiagnostics = buildPlanAdminDiagnostics(
			buildEffectivePlanPolicy(
				snapshot({
					source: 'billing_disabled',
					commercialPlan: 'unit',
					subscriptionStatus: 'active',
					collectionStatus: 'current'
				})
			),
			usage({ activeOrganizationMemberCount: 1, pendingUnexpiredInvitationCount: 0 })
		);
		const legacyDiagnostics = buildPlanAdminDiagnostics(
			buildEffectivePlanPolicy(
				snapshot({
					source: 'legacy_organization',
					commercialPlan: 'team',
					stripeCustomerId: null,
					stripeSubscriptionId: null,
					stripeProductId: null,
					stripePriceId: null,
					subscriptionStatus: null,
					collectionStatus: null,
					syncStatus: 'needs_reconciliation'
				})
			),
			usage({ activeOrganizationMemberCount: 1, pendingUnexpiredInvitationCount: 0 })
		);

		expect(giftDiagnostics.effectivePlan.sourceLabel).toBe('Admin gift');
		expect(giftDiagnostics.entitlements.map((entitlement) => entitlement.sourceLabel)).toContain('Admin gift');
		expect(fallbackDiagnostics.effectivePlan.sourceLabel).toBe('Billing-disabled fallback');
		expect(fallbackDiagnostics.entitlements.map((entitlement) => entitlement.sourceLabel)).toContain(
			'Billing-disabled fallback'
		);
		expect(legacyDiagnostics.effectivePlan.sourceLabel).toBe('Legacy organization');
	});
});
