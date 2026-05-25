import { readCurrentBillingSnapshot } from './billingState';
import {
	TIER_CONFIG,
	type BillingSnapshot,
	type BillingSnapshotSource,
	type EffectiveTier,
	type ReadOnlyReason,
	type Tier,
	type TierSource
} from '$lib/types/subscription';
import type { DataStore } from '$lib/server/core/ports';

export type PlanPolicySource = 'billing_disabled_fallback' | 'billing_snapshot' | 'admin_gift' | 'legacy_organization';

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
	key: PlanFeatureKey;
	available: boolean;
	source: 'base_plan' | 'stripe_billing' | 'admin_gift' | 'billing_disabled_fallback' | 'feature_override';
	upgradeTarget: Tier | null;
	override?: {
		id: string;
		state: PlanFeatureOverrideState;
		expiresAt: string | null;
	};
}

export interface EffectivePlanPolicy {
	organizationId: string;
	commercialPlan: Tier;
	tier: Tier;
	source: PlanPolicySource;
	billingSource: BillingSnapshotSource;
	giftTier: Tier | null;
	giftExpiresAt: string | null;
	limits: {
		activePersonnel: PlanLimitPolicy;
		activeOrganizationMembers: PlanLimitPolicy;
		pendingInvitations: PendingInvitationPolicy;
		ownedOrganizations: PlanLimitPolicy;
	};
	exportQuota: ExportQuotaPolicy;
	entitlements: Record<PlanFeatureKey, PlanFeatureEntitlement>;
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

export type PlanFeatureOverrideState = 'granted' | 'denied';

export interface PlanFeatureOverride {
	id: string;
	organizationId: string;
	featureKey: PlanFeatureKey;
	state: PlanFeatureOverrideState;
	expiresAt: string | null;
}

interface BuildEffectivePlanPolicyOptions {
	featureOverrides?: PlanFeatureOverride[];
	now?: Date;
}

export interface PersonnelUsageForPlanPolicy {
	activePersonnelCount: number;
}

export interface OrganizationOwnershipPlanCheckInput {
	ownedOrganizationCount: number;
	policies: EffectivePlanPolicy[];
}

export interface PlanLimitAvailability {
	allowed: boolean;
	message?: string;
}

const MEMBER_CAPS: Record<Tier, number | null> = {
	// Authoritative commercial member-seat caps for PRD 02. Keep these in the
	// plan policy contract so enforcement, usage summaries, and previews agree.
	free: 2,
	team: 10,
	unit: 50
};

const PENDING_INVITATION_EXCLUDED_STATUSES = ['expired', 'declined', 'revoked', 'blocked', 'accepted'];

export const PLAN_FEATURE_REGISTRY = {
	bulk_export_unlimited: {
		key: 'bulk_export_unlimited',
		enforcement: 'quota',
		label: 'Unlimited bulk exports',
		description:
			'Export organization data without the free-plan monthly export quota. Export routes enforce this through monthly_exports limits.'
	},
	advanced_reporting: {
		key: 'advanced_reporting',
		enforcement: 'binary_gate',
		label: 'Advanced reporting',
		description: 'Use advanced readiness and reporting workspaces.'
	}
} as const;

export type PlanFeatureKey = keyof typeof PLAN_FEATURE_REGISTRY;
export type BinaryPlanFeatureKey = {
	[K in PlanFeatureKey]: (typeof PLAN_FEATURE_REGISTRY)[K]['enforcement'] extends 'binary_gate' ? K : never;
}[PlanFeatureKey];

interface PlanFeatureOverrideRow {
	id: string;
	organization_id: string;
	feature_key: string;
	override_state: string;
	expires_at: string | null;
	created_at?: string | null;
	revoked_at?: string | null;
}

export function isPlanFeatureKey(value: string): value is PlanFeatureKey {
	return Object.prototype.hasOwnProperty.call(PLAN_FEATURE_REGISTRY, value);
}

function isPlanFeatureOverrideState(value: string): value is PlanFeatureOverrideState {
	return value === 'granted' || value === 'denied';
}

function mapFeatureOverrideRow(row: PlanFeatureOverrideRow): PlanFeatureOverride | null {
	if (!isPlanFeatureKey(row.feature_key) || !isPlanFeatureOverrideState(row.override_state)) return null;
	return {
		id: row.id,
		organizationId: row.organization_id,
		featureKey: row.feature_key,
		state: row.override_state,
		expiresAt: row.expires_at
	};
}

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
	if (source === 'billing_snapshot') return 'stripe_billing';
	if (source === 'billing_disabled_fallback') return 'billing_disabled_fallback';
	return 'base_plan';
}

function limit(value: number | null): number | null {
	return value === Infinity ? null : value;
}

function featureAvailableOnPlan(feature: PlanFeatureKey, plan: Tier): boolean {
	switch (feature) {
		case 'bulk_export_unlimited':
			return plan !== 'free';
		case 'advanced_reporting':
			return plan === 'unit';
		default: {
			const unhandledFeature: never = feature;
			throw new Error(`Unhandled plan feature: ${String(unhandledFeature)}`);
		}
	}
}

function featureUpgradeTarget(feature: PlanFeatureKey, plan: Tier): Tier | null {
	if (featureAvailableOnPlan(feature, plan)) return null;
	switch (feature) {
		case 'bulk_export_unlimited':
			return 'team';
		case 'advanced_reporting':
			return 'unit';
		default: {
			const unhandledFeature: never = feature;
			throw new Error(`Unhandled plan feature: ${String(unhandledFeature)}`);
		}
	}
}

function isActiveFeatureOverride(override: PlanFeatureOverride, now: Date): boolean {
	return !override.expiresAt || new Date(override.expiresAt).getTime() > now.getTime();
}

function applyFeatureOverrides(
	entitlements: Record<PlanFeatureKey, PlanFeatureEntitlement>,
	overrides: PlanFeatureOverride[],
	now: Date
): Record<PlanFeatureKey, PlanFeatureEntitlement> {
	const next = { ...entitlements };

	for (const override of overrides) {
		if (!isActiveFeatureOverride(override, now)) continue;
		next[override.featureKey] = {
			key: override.featureKey,
			available: override.state === 'granted',
			source: 'feature_override',
			upgradeTarget: null,
			override: {
				id: override.id,
				state: override.state,
				expiresAt: override.expiresAt
			}
		};
	}

	return next;
}

function buildEntitlements(
	plan: Tier,
	source: PlanPolicySource,
	overrides: PlanFeatureOverride[],
	now: Date
): Record<PlanFeatureKey, PlanFeatureEntitlement> {
	const resolvedSource = entitlementSource(source);

	return applyFeatureOverrides(
		{
			bulk_export_unlimited: {
				key: 'bulk_export_unlimited',
				available: featureAvailableOnPlan('bulk_export_unlimited', plan),
				source: resolvedSource,
				upgradeTarget: featureUpgradeTarget('bulk_export_unlimited', plan)
			},
			advanced_reporting: {
				key: 'advanced_reporting',
				available: featureAvailableOnPlan('advanced_reporting', plan),
				source: resolvedSource,
				upgradeTarget: featureUpgradeTarget('advanced_reporting', plan)
			}
		},
		overrides,
		now
	);
}

function effectiveTierSource(source: PlanPolicySource): TierSource {
	switch (source) {
		case 'admin_gift':
			return 'gift';
		case 'billing_disabled_fallback':
			return 'billing_disabled';
		case 'billing_snapshot':
			return 'subscription';
		case 'legacy_organization':
			return 'default';
		default: {
			const unhandledSource: never = source;
			throw new Error(`Unhandled plan policy source: ${String(unhandledSource)}`);
		}
	}
}

function readOnlyReasonFromPolicy(code: PlanPolicyDenialReason['code'] | null): ReadOnlyReason | null {
	switch (code) {
		case 'denied.payment_failed':
			return 'payment_failure';
		case 'denied.billing_not_current':
			return 'billing_state';
		case 'denied.personnel_limit':
			return 'personnel_limit';
		case 'denied.member_limit':
		case 'denied.pending_invitation_limit':
		case 'denied.organization_ownership_limit':
		case 'denied.export_quota':
		case null:
			return null;
		default: {
			const unhandledCode: never = code;
			throw new Error(`Unhandled plan policy denial code: ${String(unhandledCode)}`);
		}
	}
}

export function getAvailablePersonnelSlotsForPlanPolicy(
	policy: EffectivePlanPolicy,
	usage: PersonnelUsageForPlanPolicy
): number | null {
	const personnelLimit = policy.limits.activePersonnel.limit;
	if (personnelLimit === null) return null;
	return Math.max(0, personnelLimit - usage.activePersonnelCount);
}

export function checkCanAddPersonnelForPlanPolicy(
	policy: EffectivePlanPolicy,
	usage: PersonnelUsageForPlanPolicy
): PlanLimitAvailability {
	const readOnlyReason = policy.readOnly.reasons[0];
	if (readOnlyReason) {
		return {
			allowed: false,
			message: readOnlyReason.message
		};
	}

	const personnelLimit = policy.limits.activePersonnel.limit;
	if (personnelLimit !== null && usage.activePersonnelCount >= personnelLimit) {
		return {
			allowed: false,
			message: 'Personnel limit reached. Upgrade or archive personnel to add more.'
		};
	}

	return { allowed: true };
}

export function toEffectiveTierFromPlanPolicy(
	policy: EffectivePlanPolicy,
	usage: PersonnelUsageForPlanPolicy
): EffectiveTier {
	const personnelLimit = policy.limits.activePersonnel.limit;
	const compatibilityPersonnelCap =
		policy.source === 'legacy_organization' && policy.tier === 'unit' && personnelLimit !== null
			? Math.max(personnelLimit, usage.activePersonnelCount)
			: personnelLimit;
	const isOverPersonnelLimit =
		compatibilityPersonnelCap !== null && usage.activePersonnelCount > compatibilityPersonnelCap;
	const policyReadOnlyReason = readOnlyReasonFromPolicy(policy.readOnly.reasons[0]?.code ?? null);

	return {
		tier: policy.tier,
		source: effectiveTierSource(policy.source),
		personnelCount: usage.activePersonnelCount,
		personnelCap: compatibilityPersonnelCap ?? Infinity,
		isReadOnly: policy.readOnly.enabled || isOverPersonnelLimit,
		readOnlyReason: policyReadOnlyReason ?? (isOverPersonnelLimit ? 'personnel_limit' : null),
		giftExpiresAt: policy.source === 'admin_gift' ? policy.giftExpiresAt : null,
		giftTier: policy.source === 'admin_gift' ? policy.giftTier : null
	};
}

export function checkCanCreateOrganizationForPlanPolicies(
	input: OrganizationOwnershipPlanCheckInput
): PlanLimitAvailability {
	let highestOwnedOrganizationLimit = TIER_CONFIG.free.maxOrgsOwned;

	for (const policy of input.policies) {
		const policyLimit = policy.limits.ownedOrganizations.limit;
		if (policyLimit === null) return { allowed: true };
		highestOwnedOrganizationLimit = Math.max(highestOwnedOrganizationLimit, policyLimit);
	}

	if (input.ownedOrganizationCount >= highestOwnedOrganizationLimit) {
		return {
			allowed: false,
			message: `You can own up to ${highestOwnedOrganizationLimit} organization(s) on your current plan.`
		};
	}

	return { allowed: true };
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

export function buildEffectivePlanPolicy(
	snapshot: BillingSnapshot,
	options: BuildEffectivePlanPolicyOptions = {}
): EffectivePlanPolicy {
	const source = mapPolicySource(snapshot);
	const plan = snapshot.commercialPlan;
	const tierConfig = TIER_CONFIG[plan];
	const hasUnlimitedFallback = source === 'billing_disabled_fallback';
	const exportLimit = hasUnlimitedFallback ? null : limit(tierConfig.bulkExportsPerMonth);
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
		giftTier: source === 'admin_gift' ? snapshot.giftTier : null,
		giftExpiresAt: source === 'admin_gift' ? snapshot.giftExpiresAt : null,
		limits: {
			activePersonnel: {
				limit: hasUnlimitedFallback ? null : limit(tierConfig.personnelCap),
				enforcement: 'hard_cap',
				denialCode: 'denied.personnel_limit',
				upgradeTarget: plan === 'unit' ? null : plan === 'team' ? 'unit' : 'team'
			},
			activeOrganizationMembers: {
				limit: hasUnlimitedFallback ? null : MEMBER_CAPS[plan],
				enforcement: 'active_members_plus_pending_invitations',
				denialCode: 'denied.member_limit',
				upgradeTarget: plan === 'unit' ? null : plan === 'team' ? 'unit' : 'team'
			},
			pendingInvitations: {
				limit: hasUnlimitedFallback ? null : MEMBER_CAPS[plan],
				enforcement: 'active_members_plus_pending_invitations',
				denialCode: 'denied.pending_invitation_limit',
				upgradeTarget: plan === 'unit' ? null : plan === 'team' ? 'unit' : 'team',
				countsTowardMemberLimit: true,
				excludedStatuses: PENDING_INVITATION_EXCLUDED_STATUSES
			},
			ownedOrganizations: {
				limit: hasUnlimitedFallback ? null : limit(tierConfig.maxOrgsOwned),
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
		entitlements: buildEntitlements(plan, source, options.featureOverrides ?? [], options.now ?? new Date()),
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

function activeFeatureOverridesFromPolicy(policy: EffectivePlanPolicy): PlanFeatureOverride[] {
	return Object.values(policy.entitlements)
		.filter((entitlement) => entitlement.override !== undefined)
		.map((entitlement) => ({
			id: entitlement.override!.id,
			organizationId: policy.organizationId,
			featureKey: entitlement.key,
			state: entitlement.override!.state,
			expiresAt: entitlement.override!.expiresAt
		}));
}

export function buildEffectivePlanPolicyForTier(policy: EffectivePlanPolicy, targetTier: Tier): EffectivePlanPolicy {
	const targetPolicy = buildEffectivePlanPolicy(
		{
			organizationId: policy.organizationId,
			source: policy.billingSource,
			commercialPlan: targetTier,
			stripeCustomerId: null,
			stripeSubscriptionId: null,
			stripeProductId: null,
			stripePriceId: null,
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
			giftTier: policy.giftTier,
			giftExpiresAt: policy.giftExpiresAt
		},
		{ featureOverrides: activeFeatureOverridesFromPolicy(policy) }
	);

	return {
		...targetPolicy,
		grace: {
			mode: 'none',
			message: null
		},
		readOnly: {
			enabled: false,
			reasons: []
		}
	};
}

export async function readEffectivePlanPolicy(ports: PlanPolicyPorts): Promise<EffectivePlanPolicy> {
	const snapshot = await readCurrentBillingSnapshot(ports);
	const overrideRows = await ports.store.findMany<PlanFeatureOverrideRow>(
		'organization_plan_feature_overrides',
		ports.auth.orgId
	);
	const featureOverrides = overrideRows
		.filter((row) => row.revoked_at == null)
		.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
		.map((row) => mapFeatureOverrideRow(row))
		.filter((override): override is PlanFeatureOverride => override !== null);

	return buildEffectivePlanPolicy(snapshot, { featureOverrides });
}
