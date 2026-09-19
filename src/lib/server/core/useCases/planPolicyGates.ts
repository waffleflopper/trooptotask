import type { Tier } from '$lib/types/subscription';
import {
	PLAN_FEATURE_REGISTRY,
	isPlanFeatureKey,
	type BinaryPlanFeatureKey,
	type EffectivePlanPolicy,
	type PlanFeatureEntitlement,
	type PlanLimitDimension
} from './planPolicy';

export interface PlanGateDenial {
	code: 'denied.unknown_plan_feature' | 'denied.plan_feature_unavailable';
	dimension: PlanLimitDimension;
	featureKey?: string;
	featureLabel?: string;
	message: string;
	remediation: string;
	upgradeTarget: Tier | null;
}

export type PlanGateResult<T = undefined> = { allowed: true; value?: T } | { allowed: false; denial: PlanGateDenial };

export function checkPlanFeatureByKey(
	policy: EffectivePlanPolicy,
	key: string
): PlanGateResult<PlanFeatureEntitlement> {
	if (!isPlanFeatureKey(key)) {
		return {
			allowed: false,
			denial: {
				code: 'denied.unknown_plan_feature',
				dimension: 'billing_state',
				featureKey: key,
				message: 'This feature is not available.',
				remediation: 'Contact support if this feature should be available for your organization.',
				upgradeTarget: null
			}
		};
	}

	const entitlement = policy.entitlements[key];
	const feature = PLAN_FEATURE_REGISTRY[key];
	if (entitlement.available) {
		return { allowed: true, value: entitlement };
	}

	return {
		allowed: false,
		denial: {
			code: 'denied.plan_feature_unavailable',
			dimension: 'billing_state',
			featureKey: key,
			featureLabel: feature.label,
			message: `${feature.label} is not available on your current plan.`,
			remediation: entitlement.upgradeTarget
				? `Upgrade to ${entitlement.upgradeTarget} to use this feature.`
				: 'Contact support to change plan access.',
			upgradeTarget: entitlement.upgradeTarget
		}
	};
}

export function checkPlanFeature(
	policy: EffectivePlanPolicy,
	key: BinaryPlanFeatureKey
): PlanGateResult<PlanFeatureEntitlement> {
	return checkPlanFeatureByKey(policy, key);
}

export function requirePlanFeature(policy: EffectivePlanPolicy, key: BinaryPlanFeatureKey): PlanFeatureEntitlement {
	const result = checkPlanFeature(policy, key);
	if (!result.allowed) throw planGateError(403, result.denial);
	return result.value as PlanFeatureEntitlement;
}

export function planGateError(status: number, denial: PlanGateDenial): Error {
	const err = new Error(denial.message);
	Object.assign(err, { status, denial });
	return err;
}
