import type { SupabaseClient } from '$lib/server/database';

import type {
	BlockedOrganizationInvitation,
	RejectAccessRequestAndBlockInvitationsResult,
	RescindAccessRequestAndBlockInvitationsResult
} from './contracts';

interface BlockedInvitationRpcRow {
	organization_invitation_id: string | null;
	organization_id: string | null;
	invitation_email: string | null;
	blocked_at: string | null;
}

interface RejectAccessRequestAndBlockInvitationsRpcRow extends BlockedInvitationRpcRow {
	reject_status: 'rejected' | 'not_found' | null;
}

interface RescindAccessRequestAndBlockInvitationsRpcRow extends BlockedInvitationRpcRow {
	rescind_status: 'rescinded' | 'not_found' | 'completed' | 'claim-held' | null;
}

interface AccessRequestWithdrawalRpcClient {
	rpc(
		fn: 'reject_access_request_and_block_linked_invitations',
		args: { p_access_request_id: string; p_reviewer_id: string }
	): PromiseLike<{ data: RejectAccessRequestAndBlockInvitationsRpcRow[] | null; error: { message?: string } | null }>;
	rpc(
		fn: 'rescind_access_request_and_block_linked_invitations',
		args: { p_access_request_id: string; p_reviewer_id: string }
	): PromiseLike<{ data: RescindAccessRequestAndBlockInvitationsRpcRow[] | null; error: { message?: string } | null }>;
}

function mapBlockedInvitations(rows: BlockedInvitationRpcRow[]): BlockedOrganizationInvitation[] {
	return rows
		.filter(
			(
				row
			): row is BlockedInvitationRpcRow & {
				organization_invitation_id: string;
				organization_id: string;
				invitation_email: string;
				blocked_at: string;
			} =>
				typeof row.organization_invitation_id === 'string' &&
				typeof row.organization_id === 'string' &&
				typeof row.invitation_email === 'string' &&
				typeof row.blocked_at === 'string'
		)
		.map((row) => ({
			id: row.organization_invitation_id,
			organizationId: row.organization_id,
			email: row.invitation_email,
			blockedAt: row.blocked_at
		}));
}

export async function rejectAccessRequestAndBlockLinkedInvitations(
	supabase: SupabaseClient,
	input: { accessRequestId: string; reviewerId: string }
): Promise<RejectAccessRequestAndBlockInvitationsResult> {
	const { data, error } = await (supabase as unknown as AccessRequestWithdrawalRpcClient).rpc(
		'reject_access_request_and_block_linked_invitations',
		{
			p_access_request_id: input.accessRequestId,
			p_reviewer_id: input.reviewerId
		}
	);

	if (error) {
		return {
			status: 'failed',
			message: 'Access request could not be rejected',
			blockedInvitations: []
		};
	}

	const rows = data ?? [];
	if (rows[0]?.reject_status === 'not_found') {
		return { status: 'not_found', blockedInvitations: [] };
	}

	if (rows[0]?.reject_status !== 'rejected') {
		return {
			status: 'failed',
			message: 'Access request rejection returned an unexpected result',
			blockedInvitations: []
		};
	}

	return { status: 'rejected', blockedInvitations: mapBlockedInvitations(rows) };
}

export async function rescindAccessRequestAndBlockLinkedInvitations(
	supabase: SupabaseClient,
	input: { accessRequestId: string; reviewerId: string }
): Promise<RescindAccessRequestAndBlockInvitationsResult> {
	const { data, error } = await (supabase as unknown as AccessRequestWithdrawalRpcClient).rpc(
		'rescind_access_request_and_block_linked_invitations',
		{
			p_access_request_id: input.accessRequestId,
			p_reviewer_id: input.reviewerId
		}
	);

	if (error) {
		return { status: 'failed', message: 'Access request could not be rescinded', blockedInvitations: [] };
	}

	const rows = data ?? [];
	const status = rows[0]?.rescind_status;
	if (status === 'not_found' || status === 'completed' || status === 'claim-held') {
		return { status, blockedInvitations: [] };
	}

	if (status !== 'rescinded') {
		return {
			status: 'failed',
			message: 'Access request rescission returned an unexpected result',
			blockedInvitations: []
		};
	}

	return { status: 'rescinded', blockedInvitations: mapBlockedInvitations(rows) };
}
