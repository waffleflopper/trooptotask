import { describe, expect, it } from 'vitest';
import type { BillingSnapshot } from '$lib/types/subscription';
import { buildEffectivePlanPolicy } from './planPolicy';
import {
	checkPlanFeature,
	checkPlanFeatureByKey,
	checkWithinPlanLimit,
	requirePlanFeature,
	requireWithinPlanLimit
} from './planPolicyGates';

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
	it('reports feature availability and upgrade targets by plan', () => {
		const freePolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));
		const teamPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' }));
		const unitPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'unit' }));

		expect(freePolicy.entitlements.bulk_export_unlimited).toMatchObject({
			available: false,
			upgradeTarget: 'team'
		});
		expect(teamPolicy.entitlements.bulk_export_unlimited).toMatchObject({ available: true });
		expect(checkPlanFeature(teamPolicy, 'advanced_reporting')).toMatchObject({
			allowed: false,
			denial: { upgradeTarget: 'unit' }
		});
		expect(checkPlanFeature(unitPolicy, 'advanced_reporting')).toMatchObject({ allowed: true });
	});

	it('honors gift precedence for feature availability', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				source: 'gift',
				commercialPlan: 'unit',
				giftTier: 'unit',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			})
		);

		expect(checkPlanFeature(policy, 'advanced_reporting')).toMatchObject({
			allowed: true,
			value: {
				key: 'advanced_reporting',
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

	it('throws from requirePlanFeature for a known but unavailable feature', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));

		expect(() => requirePlanFeature(policy, 'advanced_reporting')).toThrow(
			'Advanced reporting is not available on your current plan.'
		);
	});

	it('returns structured denial data when a plan limit is reached', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));

		expect(checkWithinPlanLimit(policy, 'monthly_exports', 3)).toEqual({
			allowed: false,
			denial: {
				code: 'denied.export_quota',
				dimension: 'monthly_exports',
				message: 'Export limit reached (3/month). Upgrade for unlimited exports.',
				remediation: 'Upgrade for unlimited exports or wait until next month.',
				upgradeTarget: 'team'
			}
		});
	});

	it('throws from requireWithinPlanLimit when quota is reached', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));

		expect(() => requireWithinPlanLimit(policy, 'monthly_exports', 3)).toThrow(
			'Export limit reached (3/month). Upgrade for unlimited exports.'
		);
	});
});
