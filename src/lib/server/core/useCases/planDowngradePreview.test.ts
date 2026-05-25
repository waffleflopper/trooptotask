import { describe, expect, it } from 'vitest';
import type { BillingSnapshot } from '$lib/types/subscription';
import { buildEffectivePlanPolicy, buildEffectivePlanPolicyForTier } from './planPolicy';
import type { OrganizationPlanUsage } from './organizationPlanUsage';
import { buildPlanDowngradePreview } from './planDowngradePreview';

function snapshot(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
	return {
		organizationId: 'org-1',
		source: 'stripe',
		commercialPlan: 'unit',
		stripeCustomerId: 'cus_123',
		stripeSubscriptionId: 'sub_123',
		stripeProductId: 'prod_unit',
		stripePriceId: 'price_unit',
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
		activePersonnelCount: 90,
		activeOrganizationMemberCount: 10,
		pendingUnexpiredInvitationCount: 1,
		monthlyExportCount: 4,
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

describe('plan downgrade preview', () => {
	it('flags lower-plan usage limits, export quota, feature loss, and data preservation copy', () => {
		const currentPolicy = buildEffectivePlanPolicy(snapshot());
		const targetPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));

		const preview = buildPlanDowngradePreview({ currentPolicy, targetPolicy, usage: usage() });

		expect(preview).toMatchObject({
			currentPlan: {
				tier: 'unit',
				sourceLabel: 'Stripe-backed billing'
			},
			targetPlan: {
				tier: 'free',
				name: 'Free',
				sourceLabel: 'Stripe-backed billing'
			},
			status: 'blocked',
			preservesExistingDataMessage:
				'Existing data is preserved after downgrade, but over-limit usage, unavailable features, or read-only billing states can block new writes until resolved.'
		});
		expect(preview.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					dimension: 'active_personnel',
					status: 'over_limit',
					used: 90,
					limit: 20,
					remediation: 'Archive personnel before downgrading or choose Team.'
				}),
				expect.objectContaining({
					dimension: 'active_organization_members',
					status: 'over_limit',
					used: 10,
					limit: 2,
					remediation: 'Remove members before downgrading or choose Team.'
				}),
				expect.objectContaining({
					dimension: 'pending_invitations',
					status: 'over_limit',
					used: 1,
					limit: 2,
					message: 'Pending invitations reserve 1 seat; 11 of 2 target member seats would be used.'
				}),
				expect.objectContaining({
					dimension: 'monthly_exports',
					status: 'over_limit',
					used: 4,
					limit: 3,
					remediation: 'Wait until next month or choose Team for unlimited exports.'
				})
			])
		);
		expect(preview.featureLosses).toEqual([
			expect.objectContaining({
				featureKey: 'bulk_export_unlimited',
				label: 'Unlimited bulk exports',
				remediation: 'Choose Team to keep Unlimited bulk exports.'
			}),
			expect.objectContaining({
				featureKey: 'advanced_reporting',
				label: 'Advanced reporting',
				remediation: 'Choose Unit to keep Advanced reporting.'
			})
		]);
		expect(preview.blockers.map((blocker) => blocker.label)).toEqual([
			'Personnel',
			'Members',
			'Pending invitations',
			'Monthly exports',
			'Unlimited bulk exports',
			'Advanced reporting'
		]);
	});

	it('keeps within-limit usage distinct from feature-loss blockers', () => {
		const currentPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' }));
		const targetPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));

		const preview = buildPlanDowngradePreview({
			currentPolicy,
			targetPolicy,
			usage: usage({
				activePersonnelCount: 12,
				activeOrganizationMemberCount: 1,
				pendingUnexpiredInvitationCount: 0,
				monthlyExportCount: 1
			})
		});

		expect(preview.status).toBe('blocked');
		expect(preview.rows.map((row) => row.status)).toEqual([
			'within_limit',
			'within_limit',
			'within_limit',
			'within_limit'
		]);
		expect(preview.featureLosses).toEqual([
			expect.objectContaining({
				featureKey: 'bulk_export_unlimited',
				remediation: 'Choose Team to keep Unlimited bulk exports.'
			})
		]);
		expect(preview.blockers).toEqual([expect.objectContaining({ featureKey: 'bulk_export_unlimited' })]);
	});

	it('includes policy read-only reasons in downgrade blockers and preservation copy', () => {
		const currentPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' }));
		const targetPolicy = buildEffectivePlanPolicy(
			snapshot({
				commercialPlan: 'free',
				subscriptionStatus: 'past_due',
				collectionStatus: 'payment_failed_grace'
			})
		);

		const preview = buildPlanDowngradePreview({
			currentPolicy,
			targetPolicy,
			usage: usage({
				activePersonnelCount: 12,
				activeOrganizationMemberCount: 1,
				pendingUnexpiredInvitationCount: 0,
				monthlyExportCount: 1
			})
		});

		expect(preview.preservesExistingDataMessage).toContain('read-only');
		expect(preview.readOnlyImpacts).toEqual([
			expect.objectContaining({
				dimension: 'billing_state',
				label: 'Billing state',
				remediation: 'Update the payment method or contact support.'
			})
		]);
		expect(preview.blockers).toContainEqual(
			expect.objectContaining({
				dimension: 'billing_state',
				label: 'Billing state'
			})
		);
	});

	it('does not leak the current billing read-only state into generated target-tier previews', () => {
		const currentPolicy = buildEffectivePlanPolicy(
			snapshot({
				commercialPlan: 'team',
				subscriptionStatus: 'past_due',
				collectionStatus: 'payment_failed_grace'
			})
		);
		const targetPolicy = buildEffectivePlanPolicyForTier(currentPolicy, 'free');

		const preview = buildPlanDowngradePreview({
			currentPolicy,
			targetPolicy,
			usage: usage({
				activePersonnelCount: 12,
				activeOrganizationMemberCount: 1,
				pendingUnexpiredInvitationCount: 0,
				monthlyExportCount: 1
			})
		});

		expect(currentPolicy.readOnly.enabled).toBe(true);
		expect(targetPolicy.readOnly.enabled).toBe(false);
		expect(preview.readOnlyImpacts).toEqual([]);
		expect(preview.blockers).not.toContainEqual(expect.objectContaining({ dimension: 'billing_state' }));
	});

	it('flags exact personnel and member caps as limit reached for target plans', () => {
		const currentPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'unit' }));
		const targetPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' }));

		const preview = buildPlanDowngradePreview({
			currentPolicy,
			targetPolicy,
			usage: usage({
				activePersonnelCount: 80,
				activeOrganizationMemberCount: 10,
				pendingUnexpiredInvitationCount: 0,
				monthlyExportCount: 0
			})
		});

		expect(preview.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ dimension: 'active_personnel', status: 'limit_reached' }),
				expect.objectContaining({ dimension: 'active_organization_members', status: 'limit_reached' })
			])
		);
		expect(preview.blockers).toEqual([expect.objectContaining({ featureKey: 'advanced_reporting' })]);
		expect(preview.blockers).not.toContainEqual(expect.objectContaining({ dimension: 'active_personnel' }));
		expect(preview.blockers).not.toContainEqual(expect.objectContaining({ dimension: 'active_organization_members' }));
	});
});
