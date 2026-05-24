import type { Tier } from '$lib/types/subscription';
import type { EffectivePlanPolicy, PlanLimitDimension, PlanPolicyDenialReason, PlanPolicySource } from './planPolicy';
import type { OrganizationPlanUsage } from './organizationPlanUsage';

export type PlanUsageSummaryStatus = 'within_limit' | 'limit_reached' | 'over_limit' | 'read_only';

export interface PlanUsageSummaryRow {
	dimension: PlanLimitDimension;
	label: string;
	used: number;
	limit: number | null;
	limitLabel: string;
	status: PlanUsageSummaryStatus;
	message: string;
	remediation: string;
	upgradeTarget: Tier | null;
}

export interface PlanUsageSummaryAlert {
	dimension: PlanLimitDimension;
	label: string;
	message: string;
	remediation: string;
	status: PlanUsageSummaryStatus;
}

export interface PlanUsageSummary {
	plan: {
		tier: Tier;
		source: PlanPolicySource;
		sourceLabel: string;
	};
	rows: PlanUsageSummaryRow[];
	alerts: PlanUsageSummaryAlert[];
}

function sourceLabel(source: PlanPolicySource): string {
	switch (source) {
		case 'admin_gift':
			return 'Admin gift';
		case 'billing_disabled_fallback':
			return 'Billing-disabled fallback';
		case 'legacy_organization':
			return 'Legacy organization';
		case 'billing_snapshot':
			return 'Stripe-backed billing';
	}
}

function formatLimit(limit: number | null): string {
	return limit === null ? 'Unlimited' : String(limit);
}

function formatUpgradeTarget(tier: Tier): string {
	return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function personnelRemediation(upgradeTarget: Tier | null): string {
	if (!upgradeTarget) return 'Archive personnel or contact support.';
	return `Archive personnel or upgrade to ${formatUpgradeTarget(upgradeTarget)}.`;
}

function memberRemediation(upgradeTarget: Tier | null): string {
	if (!upgradeTarget) return 'Remove members or contact support.';
	return `Remove members or upgrade to ${formatUpgradeTarget(upgradeTarget)}.`;
}

function invitationRemediation(upgradeTarget: Tier | null): string {
	if (!upgradeTarget) return 'Revoke pending invitations or contact support.';
	return `Revoke pending invitations or upgrade to ${formatUpgradeTarget(upgradeTarget)}.`;
}

function exportRemediation(upgradeTarget: Tier | null): string {
	if (!upgradeTarget) return 'Contact support or wait until next month.';
	return 'Upgrade for unlimited exports or wait until next month.';
}

function limitStatus(used: number, limit: number | null, reachedAtLimit = false): PlanUsageSummaryStatus {
	if (limit === null) return 'within_limit';
	if (used > limit) return 'over_limit';
	if (reachedAtLimit && used >= limit) return 'limit_reached';
	return 'within_limit';
}

function rowAlert(row: PlanUsageSummaryRow): PlanUsageSummaryAlert | null {
	if (row.status === 'within_limit') return null;
	return {
		dimension: row.dimension,
		label: row.label,
		message: row.message,
		remediation: row.remediation,
		status: row.status
	};
}

function readOnlyAlert(reason: PlanPolicyDenialReason): PlanUsageSummaryAlert {
	return {
		dimension: reason.dimension,
		label: reason.dimension === 'billing_state' ? 'Billing state' : reason.dimension,
		message: reason.message,
		remediation: reason.remediation,
		status: 'read_only'
	};
}

export function buildPlanUsageSummary(policy: EffectivePlanPolicy, usage: OrganizationPlanUsage): PlanUsageSummary {
	const memberLimit = policy.limits.activeOrganizationMembers.limit;
	const usedMemberSeats = usage.activeOrganizationMemberCount + usage.pendingUnexpiredInvitationCount;
	const pendingInvitationStatus =
		memberLimit !== null && usage.pendingUnexpiredInvitationCount > 0 && usedMemberSeats >= memberLimit
			? usedMemberSeats > memberLimit
				? 'over_limit'
				: 'limit_reached'
			: 'within_limit';

	const rows: PlanUsageSummaryRow[] = [
		{
			dimension: 'active_personnel',
			label: 'Personnel',
			used: usage.activePersonnelCount,
			limit: policy.limits.activePersonnel.limit,
			limitLabel: formatLimit(policy.limits.activePersonnel.limit),
			status: limitStatus(usage.activePersonnelCount, policy.limits.activePersonnel.limit),
			message: `Personnel usage is ${usage.activePersonnelCount} of ${formatLimit(policy.limits.activePersonnel.limit)}.`,
			remediation: personnelRemediation(policy.limits.activePersonnel.upgradeTarget),
			upgradeTarget: policy.limits.activePersonnel.upgradeTarget
		},
		{
			dimension: 'active_organization_members',
			label: 'Members',
			used: usage.activeOrganizationMemberCount,
			limit: memberLimit,
			limitLabel: formatLimit(memberLimit),
			status: limitStatus(usage.activeOrganizationMemberCount, memberLimit),
			message: `Member usage is ${usage.activeOrganizationMemberCount} of ${formatLimit(memberLimit)}.`,
			remediation: memberRemediation(policy.limits.activeOrganizationMembers.upgradeTarget),
			upgradeTarget: policy.limits.activeOrganizationMembers.upgradeTarget
		},
		{
			dimension: 'pending_invitations',
			label: 'Pending invitations',
			used: usage.pendingUnexpiredInvitationCount,
			limit: policy.limits.pendingInvitations.limit,
			limitLabel: formatLimit(policy.limits.pendingInvitations.limit),
			status: pendingInvitationStatus,
			message: `Pending invitations use ${usage.pendingUnexpiredInvitationCount} seat${
				usage.pendingUnexpiredInvitationCount === 1 ? '' : 's'
			}; ${usedMemberSeats} of ${formatLimit(memberLimit)} member seats are reserved.`,
			remediation: invitationRemediation(policy.limits.pendingInvitations.upgradeTarget),
			upgradeTarget: policy.limits.pendingInvitations.upgradeTarget
		},
		{
			dimension: 'monthly_exports',
			label: 'Monthly exports',
			used: usage.monthlyExportCount,
			limit: policy.exportQuota.limit,
			limitLabel: formatLimit(policy.exportQuota.limit),
			status: limitStatus(usage.monthlyExportCount, policy.exportQuota.limit, true),
			message: `Export usage is ${usage.monthlyExportCount} of ${formatLimit(policy.exportQuota.limit)} this month.`,
			remediation: exportRemediation(policy.exportQuota.upgradeTarget),
			upgradeTarget: policy.exportQuota.upgradeTarget
		}
	];

	return {
		plan: {
			tier: policy.tier,
			source: policy.source,
			sourceLabel: sourceLabel(policy.source)
		},
		rows,
		alerts: [
			...rows.map(rowAlert).filter((alert): alert is PlanUsageSummaryAlert => alert !== null),
			...policy.readOnly.reasons.map(readOnlyAlert)
		]
	};
}
