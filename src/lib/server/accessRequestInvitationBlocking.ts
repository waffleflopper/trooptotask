import type { SupabaseClient } from '@supabase/supabase-js';

export interface BlockedOrganizationInvitation {
	id: string;
	organizationId: string;
	email: string;
	blockedAt: string;
}

export type RejectAccessRequestAndBlockInvitationsResult =
	| { status: 'rejected'; blockedInvitations: BlockedOrganizationInvitation[] }
	| { status: 'not_found'; blockedInvitations: [] }
	| { status: 'failed'; message: string; blockedInvitations: [] };

interface RejectAccessRequestAndBlockInvitationsRpcRow {
	reject_status: 'rejected' | 'not_found' | null;
	organization_invitation_id: string | null;
	organization_id: string | null;
	invitation_email: string | null;
	blocked_at: string | null;
}

interface RejectAccessRequestAndBlockInvitationsRpcClient {
	rpc: (
		fn: 'reject_access_request_and_block_linked_invitations',
		args: { p_access_request_id: string; p_reviewer_id: string }
	) => PromiseLike<{
		data: RejectAccessRequestAndBlockInvitationsRpcRow[] | null;
		error: { message?: string } | null;
	}>;
}

export async function rejectAccessRequestAndBlockLinkedInvitations(
	supabase: SupabaseClient,
	input: { accessRequestId: string; reviewerId: string }
): Promise<RejectAccessRequestAndBlockInvitationsResult> {
	const { data, error } = await (supabase as unknown as RejectAccessRequestAndBlockInvitationsRpcClient).rpc(
		'reject_access_request_and_block_linked_invitations',
		{
			p_access_request_id: input.accessRequestId,
			p_reviewer_id: input.reviewerId
		}
	);

	if (error) {
		return {
			status: 'failed',
			message: error.message ?? 'Access request could not be rejected',
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

	return {
		status: 'rejected',
		blockedInvitations: rows
			.filter(
				(
					row
				): row is RejectAccessRequestAndBlockInvitationsRpcRow & {
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
			}))
	};
}
