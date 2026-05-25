import {
	PLAN_FEATURE_REGISTRY,
	type EffectivePlanPolicy,
	type PlanFeatureEntitlement,
	type PlanLimitDimension,
	type PlanPolicyDenialReason,
	type PlanPolicySource
} from './planPolicy';
import type { OrganizationPlanUsage } from './organizationPlanUsage';
import { buildPlanUsageSummary, type PlanUsageSummaryRow, type PlanUsageSummaryStatus } from './planUsageSummary';
import type { BillingSnapshotSource, Tier } from '$lib/types/subscription';

export interface PlanAdminDiagnosticsEffectivePlan {
	commercialPlan: Tier;
	tier: Tier;
	source: PlanPolicySource;
	sourceLabel: string;
	billingSource: BillingSnapshotSource;
	giftTier: Tier | null;
	giftExpiresAt: string | null;
}

export interface PlanAdminDiagnosticsReason {
	dimension: PlanLimitDimension;
	label: string;
	message: string;
	remediation: string;
	status: PlanUsageSummaryStatus;
	sourceLabel: string;
}

export interface PlanAdminDiagnosticsEntitlement {
	key: PlanFeatureEntitlement['key'];
	label: string;
	description: string;
	available: boolean;
	source: PlanFeatureEntitlement['source'];
	sourceLabel: string;
	upgradeTarget: Tier | null;
	override?: PlanFeatureEntitlement['override'];
}

export interface PlanAdminDiagnostics {
	effectivePlan: PlanAdminDiagnosticsEffectivePlan;
	grace: EffectivePlanPolicy['grace'];
	readOnly: {
		enabled: boolean;
		reasons: PlanAdminDiagnosticsReason[];
	};
	usageRows: PlanUsageSummaryRow[];
	overLimitReasons: PlanAdminDiagnosticsReason[];
	entitlements: PlanAdminDiagnosticsEntitlement[];
}

function policySourceLabel(source: PlanPolicySource): string {
	switch (source) {
		case 'admin_gift':
			return 'Admin gift';
		case 'billing_disabled_fallback':
			return 'Billing-disabled fallback';
		case 'billing_snapshot':
			return 'Local billing snapshot';
		case 'legacy_organization':
			return 'Base plan';
	}
}

function entitlementSourceLabel(source: PlanFeatureEntitlement['source']): string {
	switch (source) {
		case 'admin_gift':
			return 'Admin gift';
		case 'base_plan':
			return 'Base plan';
		case 'billing_disabled_fallback':
			return 'Billing-disabled fallback';
		case 'feature_override':
			return 'Feature override';
		case 'stripe_billing':
			return 'Paid plan';
	}
}

function dimensionLabel(dimension: PlanLimitDimension): string {
	switch (dimension) {
		case 'active_personnel':
			return 'Personnel';
		case 'active_organization_members':
			return 'Members';
		case 'pending_invitations':
			return 'Pending invitations';
		case 'owned_organizations':
			return 'Owned organizations';
		case 'monthly_exports':
			return 'Monthly exports';
		case 'billing_state':
			return 'Billing state';
	}
}

function rowReason(row: PlanUsageSummaryRow, sourceLabel: string): PlanAdminDiagnosticsReason {
	return {
		dimension: row.dimension,
		label: row.label,
		message: row.message,
		remediation: row.remediation,
		status: row.status,
		sourceLabel
	};
}

function readOnlyReason(reason: PlanPolicyDenialReason, sourceLabel: string): PlanAdminDiagnosticsReason {
	return {
		dimension: reason.dimension,
		label: dimensionLabel(reason.dimension),
		message: reason.message,
		remediation: reason.remediation,
		status: 'read_only',
		sourceLabel
	};
}

export function buildPlanAdminDiagnostics(
	policy: EffectivePlanPolicy,
	usage: OrganizationPlanUsage
): PlanAdminDiagnostics {
	const summary = buildPlanUsageSummary(policy, usage);
	const sourceLabel = policySourceLabel(policy.source);
	const overLimitRows = summary.rows
		.filter((row) => row.status === 'over_limit')
		.map((row) => rowReason(row, sourceLabel));
	const readOnlyReasons = policy.readOnly.reasons.map((reason) => readOnlyReason(reason, sourceLabel));

	return {
		effectivePlan: {
			commercialPlan: policy.commercialPlan,
			tier: policy.tier,
			source: policy.source,
			sourceLabel,
			billingSource: policy.billingSource,
			giftTier: policy.giftTier,
			giftExpiresAt: policy.giftExpiresAt
		},
		grace: policy.grace,
		readOnly: {
			enabled: policy.readOnly.enabled,
			reasons: readOnlyReasons
		},
		usageRows: summary.rows,
		overLimitReasons: [...overLimitRows, ...readOnlyReasons],
		entitlements: Object.values(policy.entitlements).map((entitlement) => {
			const registryEntry = PLAN_FEATURE_REGISTRY[entitlement.key];
			return {
				key: entitlement.key,
				label: registryEntry.label,
				description: registryEntry.description,
				available: entitlement.available,
				source: entitlement.source,
				sourceLabel: entitlementSourceLabel(entitlement.source),
				upgradeTarget: entitlement.upgradeTarget,
				override: entitlement.override
			};
		})
	};
}
