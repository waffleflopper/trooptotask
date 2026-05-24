import { readCurrentBillingSnapshot } from './billingState';
import { TIER_CONFIG, type BillingSnapshot, type BillingSnapshotSource, type Tier } from '$lib/types/subscription';
import type { DataStore } from '$lib/server/core/ports';

export type PlanPolicySource =
	| 'billing_disabled_fallback'
	| 'billing_snapshot'
	| 'admin_gift'
	| 'legacy_organization'
	| 'default';

export type PlanLimitDimension =
	| 'active_personnel'
	| 'active_organization_members'
	| 'pending_invitations'
	| 'owned_organizations'
	| 'monthly_exports'
	| 'billing_state';

export interface PlanPolicyDenialReason {
	code:
		| 'denied.payment_failed'
		| 'denied.billing_not_current'
		| 'denied.personnel_limit'
		| 'denied.member_limit'
		| 'denied.pending_invitation_limit'
		| 'denied.organization_ownership_limit'
		| 'denied.export_quota';
	dimension: PlanLimitDimension;
	message: string;
	remediation: string;
}

export interface PlanLimitPolicy {
	limit: number | null;
	enforcement: 'hard_cap' | 'active_members_plus_pending_invitations';
	denialCode: PlanPolicyDenialReason['code'];
	upgradeTarget: Tier | null;
}

export interface PendingInvitationPolicy extends PlanLimitPolicy {
	countsTowardMemberLimit: boolean;
	excludedStatuses: string[];
}

export interface ExportQuotaPolicy {
	limit: number | null;
	unlimited: boolean;
	period: 'calendar_month';
	denialCode: PlanPolicyDenialReason['code'];
	upgradeTarget: Tier | null;
}

export interface PlanFeatureEntitlement {
	key: string;
	available: boolean;
	source: 'base_plan' | 'admin_gift' | 'billing_disabled_fallback';
	upgradeTarget: Tier | null;
}

export interface EffectivePlanPolicy {
	organizationId: string;
	commercialPlan: Tier;
	tier: Tier;
	source: PlanPolicySource;
	billingSource: BillingSnapshotSource;
	limits: {
		activePersonnel: PlanLimitPolicy;
		activeOrganizationMembers: PlanLimitPolicy;
		pendingInvitations: PendingInvitationPolicy;
		ownedOrganizations: PlanLimitPolicy;
	};
	exportQuota: ExportQuotaPolicy;
	entitlements: Record<string, PlanFeatureEntitlement>;
	grace: {
		mode: 'none' | 'payment_failed';
		message: string | null;
	};
	readOnly: {
		enabled: boolean;
		reasons: PlanPolicyDenialReason[];
	};
}

interface PlanPolicyPorts {
	store: DataStore;
	auth: { orgId: string };
}

const MEMBER_CAPS: Record<Tier, number | null> = {
	free: 2,
	team: 10,
	unit: 50
};

const PENDING_INVITATION_EXCLUDED_STATUSES = ['expired', 'declined', 'revoked', 'blocked', 'accepted'];

function mapPolicySource(snapshot: BillingSnapshot): PlanPolicySource {
	switch (snapshot.source) {
		case 'billing_disabled':
			return 'billing_disabled_fallback';
		case 'gift':
			return 'admin_gift';
		case 'stripe':
			return 'billing_snapshot';
		case 'legacy_organization':
			return 'legacy_organization';
		default: {
			const unhandledSource: never = snapshot.source;
			throw new Error(`Unhandled billing source: ${String(unhandledSource)}`);
		}
	}
}

function entitlementSource(source: PlanPolicySource): PlanFeatureEntitlement['source'] {
	if (source === 'admin_gift') return 'admin_gift';
	if (source === 'billing_disabled_fallback') return 'billing_disabled_fallback';
	return 'base_plan';
}

function limit(value: number | null): number | null {
	return value === Infinity ? null : value;
}

function buildEntitlements(plan: Tier, source: PlanPolicySource): Record<string, PlanFeatureEntitlement> {
	const bulkExportAvailable = plan !== 'free';
	const advancedReportingAvailable = plan === 'unit';
	const resolvedSource = entitlementSource(source);

	return {
		bulk_export_unlimited: {
			key: 'bulk_export_unlimited',
			available: bulkExportAvailable,
			source: resolvedSource,
			upgradeTarget: bulkExportAvailable ? null : 'team'
		},
		advanced_reporting: {
			key: 'advanced_reporting',
			available: advancedReportingAvailable,
			source: resolvedSource,
			upgradeTarget: advancedReportingAvailable ? null : 'unit'
		}
	};
}

function readOnlyReasonsFor(snapshot: BillingSnapshot): PlanPolicyDenialReason[] {
	if (snapshot.subscriptionStatus === 'past_due' || snapshot.collectionStatus === 'payment_failed_grace') {
		return [
			{
				code: 'denied.payment_failed',
				dimension: 'billing_state',
				message:
					'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.',
				remediation: 'Update the payment method or contact support.'
			}
		];
	}

	if (['unpaid', 'canceled', 'incomplete', 'incomplete_expired'].includes(snapshot.subscriptionStatus ?? '')) {
		return [
			{
				code: 'denied.billing_not_current',
				dimension: 'billing_state',
				message: 'Organization billing is not currently active. Restore the subscription to regain paid write access.',
				remediation: 'Restore the subscription or choose a current plan.'
			}
		];
	}

	return [];
}

export function buildEffectivePlanPolicy(snapshot: BillingSnapshot): EffectivePlanPolicy {
	const source = mapPolicySource(snapshot);
	const plan = snapshot.commercialPlan;
	const tierConfig = TIER_CONFIG[plan];
	const exportLimit = limit(tierConfig.bulkExportsPerMonth);
	const readOnlyReasons = source === 'admin_gift' ? [] : readOnlyReasonsFor(snapshot);
	const isPaymentFailedGrace =
		source !== 'admin_gift' &&
		(snapshot.subscriptionStatus === 'past_due' || snapshot.collectionStatus === 'payment_failed_grace');

	return {
		organizationId: snapshot.organizationId,
		commercialPlan: plan,
		tier: plan,
		source,
		billingSource: snapshot.source,
		limits: {
			activePersonnel: {
				limit: limit(tierConfig.personnelCap),
				enforcement: 'hard_cap',
				denialCode: 'denied.personnel_limit',
				upgradeTarget: plan === 'unit' ? null : plan === 'team' ? 'unit' : 'team'
			},
			activeOrganizationMembers: {
				limit: MEMBER_CAPS[plan],
				enforcement: 'active_members_plus_pending_invitations',
				denialCode: 'denied.member_limit',
				upgradeTarget: plan === 'unit' ? null : plan === 'team' ? 'unit' : 'team'
			},
			pendingInvitations: {
				limit: MEMBER_CAPS[plan],
				enforcement: 'active_members_plus_pending_invitations',
				denialCode: 'denied.pending_invitation_limit',
				upgradeTarget: plan === 'unit' ? null : plan === 'team' ? 'unit' : 'team',
				countsTowardMemberLimit: true,
				excludedStatuses: PENDING_INVITATION_EXCLUDED_STATUSES
			},
			ownedOrganizations: {
				limit: limit(tierConfig.maxOrgsOwned),
				enforcement: 'hard_cap',
				denialCode: 'denied.organization_ownership_limit',
				upgradeTarget: plan === 'unit' ? null : 'unit'
			}
		},
		exportQuota: {
			limit: exportLimit,
			unlimited: exportLimit === null,
			period: 'calendar_month',
			denialCode: 'denied.export_quota',
			upgradeTarget: exportLimit === null ? null : 'team'
		},
		entitlements: buildEntitlements(plan, source),
		grace: {
			mode: isPaymentFailedGrace ? 'payment_failed' : 'none',
			message: isPaymentFailedGrace
				? 'Payment failed grace mode keeps the current plan visible while write access can be restricted.'
				: null
		},
		readOnly: {
			enabled: readOnlyReasons.length > 0,
			reasons: readOnlyReasons
		}
	};
}

export async function readEffectivePlanPolicy(ports: PlanPolicyPorts): Promise<EffectivePlanPolicy> {
	const snapshot = await readCurrentBillingSnapshot(ports);
	return buildEffectivePlanPolicy(snapshot);
}
