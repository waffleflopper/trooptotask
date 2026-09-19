import { describe, expect, it } from 'vitest';
import type { BillingSnapshot } from '$lib/types/subscription';
import { buildEffectivePlanPolicy } from './planPolicy';
import { checkPlanFeatureByKey } from './planPolicyGates';

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
		currentPeriodStart: null,
		currentPeriodEnd: null,
		cancelAtPeriodEnd: false,
		canceledAt: null,
		cancellationReason: null,
		cancellationFeedback: null,
		trialEnd: null,
		syncStatus: 'synced',
		lastStripeEventId: null,
		lastStripeEventType: null,
		lastStripeEventCreatedAt: null,
		lastProcessedAt: null,
		lastReconciledAt: null,
		reconciliationResult: null,
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null,
		...overrides
	};
}

describe('plan policy gates', () => {
	it('reports export entitlement availability and upgrade targets by plan', () => {
		const freePolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));
		const teamPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' }));
		const unitPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'unit' }));

		expect(freePolicy.entitlements.bulk_export_unlimited).toMatchObject({
			available: false,
			upgradeTarget: 'unit'
		});
		expect(teamPolicy.entitlements.bulk_export_unlimited).toMatchObject({
			available: false,
			upgradeTarget: 'unit'
		});
		expect(unitPolicy.entitlements.bulk_export_unlimited).toMatchObject({ available: true });
		expect(checkPlanFeatureByKey(teamPolicy, 'bulk_export_unlimited')).toMatchObject({
			allowed: false,
			denial: { upgradeTarget: 'unit' }
		});
		expect(checkPlanFeatureByKey(unitPolicy, 'bulk_export_unlimited')).toMatchObject({ allowed: true });
	});

	it('honors gift precedence for export entitlement availability', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				source: 'gift',
				commercialPlan: 'unit',
				giftTier: 'unit',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			})
		);

		expect(checkPlanFeatureByKey(policy, 'bulk_export_unlimited')).toMatchObject({
			allowed: true,
			value: {
				key: 'bulk_export_unlimited',
				source: 'admin_gift'
			}
		});
	});

	it('fails unknown feature keys closed with user-safe denial data', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'unit' }));

		expect(checkPlanFeatureByKey(policy, 'ai_usage')).toEqual({
			allowed: false,
			denial: {
				code: 'denied.unknown_plan_feature',
				dimension: 'billing_state',
				featureKey: 'ai_usage',
				message: 'This feature is not available.',
				remediation: 'Contact support if this feature should be available for your organization.',
				upgradeTarget: null
			}
		});
	});
});
