import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from './supabasePagination';
import { normalizeInvitationEmail } from '$lib/server/core/useCases/invitationEmail';

interface PendingOrgInvitation {
	id: string;
}

interface AcceptOrganizationInvitationRpcRow {
	accept_status: 'accepted' | 'not_found' | 'setup_required' | 'expired' | 'already_member' | 'already_accepted' | null;
	accepted_organization_id: string | null;
}

export async function autoAcceptOrgInvites(
	supabase: SupabaseClient,
	_userId: string,
	email: string
): Promise<{ accepted: number }> {
	const normalizedEmail = normalizeInvitationEmail(email);

	const { data: invitations } = await selectAllSupabaseRows<PendingOrgInvitation>(
		(from, to) =>
			supabase
				.from('organization_invitations')
				.select('id')
				.eq('normalized_email', normalizedEmail)
				.eq('status', 'pending')
				.range(from, to) as unknown as Promise<{
				data: PendingOrgInvitation[] | null;
				error: unknown;
			}>
	);

	if (!invitations?.length) {
		return { accepted: 0 };
	}

	let accepted = 0;
	for (const invitation of invitations) {
		const { data, error } = await supabase
			.rpc('accept_organization_invitation', { p_invitation_id: invitation.id })
			.single<AcceptOrganizationInvitationRpcRow>();

		if (!error && data?.accept_status === 'accepted') {
			accepted += 1;
		}
	}

	return { accepted };
}
