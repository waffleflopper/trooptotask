import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import { requireGovernancePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type {
	AdminAttention,
	AdminAttentionSnapshot,
	ApprovalAttention,
	InvitationAttention,
	InvitationsAttention
} from './adminAttentionTypes';
import type { OrganizationSettingsReader } from './settingsTypes';

/** An invitation that lapses within this long is worth a nudge before it does. */
export const EXPIRING_SOON_HOURS = 72;

export function expiresSoon(expiresAt: string, now: Date): boolean {
	return new Date(expiresAt).getTime() <= now.getTime() + EXPIRING_SOON_HOURS * 3_600_000;
}

export interface AdminAttentionContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	organizationSettings: Pick<OrganizationSettingsReader, 'listUnexpiredPendingInvitations'>;
	/** Admits its own reader; the deletion-request store enforces who may review. */
	readPendingApprovals: () => Promise<readonly ApprovalAttention[]>;
}

async function readInvitations(ctx: AdminAttentionContext, now: Date): Promise<InvitationsAttention> {
	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.inviteMember);
	const facts = await ctx.organizationSettings.listUnexpiredPendingInvitations(ctx.auth.orgId, now);
	const attention = facts.flatMap((fact): InvitationAttention[] => {
		const { id, email, expiresAt } = fact;
		if (fact.latestDeliveryStatus === 'failed') return [{ id, email, expiresAt, reason: 'deliveryFailed' }];
		if (expiresSoon(expiresAt, now)) return [{ id, email, expiresAt, reason: 'expiringSoon' }];
		return [];
	});
	return { pending: facts.length, attention: attention.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)) };
}

/** What waits on an owner or admin, read once for the Settings badges and the Dashboard. */
export function readAdminAttention(ctx: AdminAttentionContext, now = new Date()): AdminAttention {
	return { approvals: ctx.readPendingApprovals(), invitations: readInvitations(ctx, now) };
}

/** Both halves together, for a reader that cannot show one without the other. */
export async function readAdminAttentionSnapshot(
	ctx: AdminAttentionContext,
	now = new Date()
): Promise<AdminAttentionSnapshot> {
	const { approvals, invitations } = readAdminAttention(ctx, now);
	const [approvalRows, invitationRows] = await Promise.all([approvals, invitations]);
	return { approvals: approvalRows, invitations: invitationRows.attention };
}
