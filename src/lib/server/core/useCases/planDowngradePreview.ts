import {
	PLAN_FEATURE_REGISTRY,
	type EffectivePlanPolicy,
	type PlanFeatureKey,
	type PlanLimitDimension
} from './planPolicy';
import type { OrganizationPlanUsage } from './organizationPlanUsage';
import { planPolicySourceLabel } from './planPolicySourceLabel';
import { TIER_CONFIG, type Tier } from '$lib/types/subscription';

export type PlanDowngradePreviewRowStatus = 'within_limit' | 'limit_reached' | 'over_limit';
export type PlanDowngradePreviewStatus = 'available' | 'blocked';

export interface PlanDowngradePreviewRow {
	dimension: PlanLimitDimension;
	label: string;
	used: number;
	limit: number | null;
	limitLabel: string;
	status: PlanDowngradePreviewRowStatus;
	message: string;
	remediation: string;
	upgradeTarget: Tier | null;
}

export interface PlanDowngradeFeatureLoss {
	featureKey: PlanFeatureKey;
	label: string;
	message: string;
	remediation: string;
	upgradeTarget: Tier | null;
}

export interface PlanDowngradeReadOnlyImpact {
	dimension: PlanLimitDimension;
	label: string;
	message: string;
	remediation: string;
}

export type PlanDowngradePreviewBlocker =
	| PlanDowngradePreviewRow
	| PlanDowngradeFeatureLoss
	| PlanDowngradeReadOnlyImpact;

export interface PlanDowngradePreview {
	currentPlan: {
		tier: Tier;
		sourceLabel: string;
	};
	targetPlan: {
		tier: Tier;
		name: string;
		sourceLabel: string;
	};
	status: PlanDowngradePreviewStatus;
	preservesExistingDataMessage: string;
	rows: PlanDowngradePreviewRow[];
	featureLosses: PlanDowngradeFeatureLoss[];
	readOnlyImpacts: PlanDowngradeReadOnlyImpact[];
	blockers: PlanDowngradePreviewBlocker[];
}

interface BuildPlanDowngradePreviewInput {
	currentPolicy: EffectivePlanPolicy;
	targetPolicy: EffectivePlanPolicy;
	usage: OrganizationPlanUsage;
}

function formatLimit(limit: number | null): string {
	return limit === null ? 'Unlimited' : String(limit);
}

function formatTier(tier: Tier): string {
	return TIER_CONFIG[tier].name;
}

function usageStatus(used: number, limit: number | null, reachedAtLimit = false): PlanDowngradePreviewRowStatus {
	if (limit === null) return 'within_limit';
	if (used > limit) return 'over_limit';
	if (reachedAtLimit && used >= limit) return 'limit_reached';
	return 'within_limit';
}

function personnelRemediation(upgradeTarget: Tier | null): string {
	if (!upgradeTarget) return 'Archive personnel before downgrading or contact support.';
	return `Archive personnel before downgrading or choose ${formatTier(upgradeTarget)}.`;
}

function memberRemediation(upgradeTarget: Tier | null): string {
	if (!upgradeTarget) return 'Remove members before downgrading or contact support.';
	return `Remove members before downgrading or choose ${formatTier(upgradeTarget)}.`;
}

function invitationRemediation(upgradeTarget: Tier | null): string {
	if (!upgradeTarget) return 'Revoke pending invitations before downgrading or contact support.';
	return `Revoke pending invitations before downgrading or choose ${formatTier(upgradeTarget)}.`;
}

function exportRemediation(upgradeTarget: Tier | null): string {
	if (!upgradeTarget) return 'Wait until next month or contact support.';
	if (upgradeTarget === 'unit') return 'Wait until next month or choose Unit for unlimited exports.';
	return `Wait until next month or choose ${formatTier(upgradeTarget)} for more monthly exports.`;
}

function blockingRows(rows: PlanDowngradePreviewRow[]): PlanDowngradePreviewRow[] {
	return rows.filter((row) => row.status === 'over_limit');
}

function featureLosses(
	currentPolicy: EffectivePlanPolicy,
	targetPolicy: EffectivePlanPolicy
): PlanDowngradeFeatureLoss[] {
	return Object.values(currentPolicy.entitlements)
		.filter((currentEntitlement) => {
			const targetEntitlement = targetPolicy.entitlements[currentEntitlement.key];
			return currentEntitlement.available && !targetEntitlement.available;
		})
		.map((currentEntitlement) => {
			const targetEntitlement = targetPolicy.entitlements[currentEntitlement.key];
			const registryEntry = PLAN_FEATURE_REGISTRY[currentEntitlement.key];
			const upgradeTarget = targetEntitlement.upgradeTarget;
			return {
				featureKey: currentEntitlement.key,
				label: registryEntry.label,
				message: `${registryEntry.label} is available on the current plan but not on ${formatTier(targetPolicy.tier)}.`,
				remediation: upgradeTarget
					? `Choose ${formatTier(upgradeTarget)} to keep ${registryEntry.label}.`
					: `Contact support to keep ${registryEntry.label}.`,
				upgradeTarget
			};
		});
}

function readOnlyImpacts(policy: EffectivePlanPolicy): PlanDowngradeReadOnlyImpact[] {
	return policy.readOnly.reasons.map((reason) => ({
		dimension: reason.dimension,
		label: dimensionLabel(reason.dimension),
		message: reason.message,
		remediation: reason.remediation
	}));
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

export function buildPlanDowngradePreview(input: BuildPlanDowngradePreviewInput): PlanDowngradePreview {
	const { currentPolicy, targetPolicy, usage } = input;
	const memberLimit = targetPolicy.limits.activeOrganizationMembers.limit;
	const usedMemberSeats = usage.activeOrganizationMemberCount + usage.pendingUnexpiredInvitationCount;
	const pendingInvitationStatus =
		memberLimit !== null && usage.pendingUnexpiredInvitationCount > 0 && usedMemberSeats >= memberLimit
			? usedMemberSeats > memberLimit
				? 'over_limit'
				: 'limit_reached'
			: 'within_limit';

	const rows: PlanDowngradePreviewRow[] = [
		{
			dimension: 'active_personnel',
			label: 'Personnel',
			used: usage.activePersonnelCount,
			limit: targetPolicy.limits.activePersonnel.limit,
			limitLabel: formatLimit(targetPolicy.limits.activePersonnel.limit),
			status: usageStatus(usage.activePersonnelCount, targetPolicy.limits.activePersonnel.limit, true),
			message: `Personnel usage would be ${usage.activePersonnelCount} of ${formatLimit(
				targetPolicy.limits.activePersonnel.limit
			)} on ${formatTier(targetPolicy.tier)}.`,
			remediation: personnelRemediation(targetPolicy.limits.activePersonnel.upgradeTarget),
			upgradeTarget: targetPolicy.limits.activePersonnel.upgradeTarget
		},
		{
			dimension: 'active_organization_members',
			label: 'Members',
			used: usage.activeOrganizationMemberCount,
			limit: memberLimit,
			limitLabel: formatLimit(memberLimit),
			status: usageStatus(usage.activeOrganizationMemberCount, memberLimit, true),
			message: `Member usage would be ${usage.activeOrganizationMemberCount} of ${formatLimit(memberLimit)} on ${formatTier(
				targetPolicy.tier
			)}.`,
			remediation: memberRemediation(targetPolicy.limits.activeOrganizationMembers.upgradeTarget),
			upgradeTarget: targetPolicy.limits.activeOrganizationMembers.upgradeTarget
		},
		{
			dimension: 'pending_invitations',
			label: 'Pending invitations',
			used: usage.pendingUnexpiredInvitationCount,
			limit: targetPolicy.limits.pendingInvitations.limit,
			limitLabel: formatLimit(targetPolicy.limits.pendingInvitations.limit),
			status: pendingInvitationStatus,
			message: `Pending invitations reserve ${usage.pendingUnexpiredInvitationCount} seat${
				usage.pendingUnexpiredInvitationCount === 1 ? '' : 's'
			}; ${usedMemberSeats} of ${formatLimit(memberLimit)} target member seats would be used.`,
			remediation: invitationRemediation(targetPolicy.limits.pendingInvitations.upgradeTarget),
			upgradeTarget: targetPolicy.limits.pendingInvitations.upgradeTarget
		},
		{
			dimension: 'monthly_exports',
			label: 'Monthly exports',
			used: usage.monthlyExportCount,
			limit: targetPolicy.exportQuota.limit,
			limitLabel: formatLimit(targetPolicy.exportQuota.limit),
			status: usageStatus(usage.monthlyExportCount, targetPolicy.exportQuota.limit, true),
			message: `Export usage would be ${usage.monthlyExportCount} of ${formatLimit(
				targetPolicy.exportQuota.limit
			)} for the current month.`,
			remediation: exportRemediation(targetPolicy.exportQuota.upgradeTarget),
			upgradeTarget: targetPolicy.exportQuota.upgradeTarget
		}
	];
	const featureLossRows = featureLosses(currentPolicy, targetPolicy);
	const readOnlyImpactRows = readOnlyImpacts(targetPolicy);
	const blockers = [...blockingRows(rows), ...featureLossRows, ...readOnlyImpactRows];

	return {
		currentPlan: {
			tier: currentPolicy.tier,
			sourceLabel: planPolicySourceLabel(currentPolicy.source)
		},
		targetPlan: {
			tier: targetPolicy.tier,
			name: TIER_CONFIG[targetPolicy.tier].name,
			sourceLabel: planPolicySourceLabel(targetPolicy.source)
		},
		status: blockers.length > 0 ? 'blocked' : 'available',
		preservesExistingDataMessage:
			'Existing data is preserved after downgrade, but over-limit usage, unavailable features, or read-only billing states can block new writes until resolved.',
		rows,
		featureLosses: featureLossRows,
		readOnlyImpacts: readOnlyImpactRows,
		blockers
	};
}
