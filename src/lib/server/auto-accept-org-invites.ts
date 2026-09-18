import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from './supabasePagination';
import { normalizeInvitationEmail } from '$lib/server/core/useCases/invitationEmail';

export class InvitationAcceptanceError extends Error {
	constructor(
		readonly accepted: number,
		readonly reason: 'unavailable' | 'setup_required' = 'unavailable'
	) {
		super('Invitation acceptance is incomplete');
	}
}

export async function autoAcceptOrgInvites(
	supabase: SupabaseClient,
	email: string
): Promise<{ accepted: number; unavailable: number }> {
	let accepted = 0;
	let unavailable = 0;
	try {
		const normalizedEmail = normalizeInvitationEmail(email);
		if (!normalizedEmail) throw new InvitationAcceptanceError(0);
		// Validate each page before pagination can turn a missing payload into an empty list.
		const { data: invitations, error } = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
			const result = await supabase
				.from('organization_invitations')
				.select('id')
				.eq('normalized_email', normalizedEmail)
				.eq('status', 'pending')
				.order('id')
				.range(from, to);
			if (
				result?.error !== null ||
				!Array.isArray(result.data) ||
				result.data.some((row) => !row || typeof row.id !== 'string' || !row.id.trim())
			)
				throw new InvitationAcceptanceError(0);
			return result;
		});
		if (error || !invitations) throw new InvitationAcceptanceError(0);
		// Fetch the whole snapshot before mutations remove rows from the pending query.
		for (const invitation of invitations) {
			const result = await supabase
				.rpc('accept_organization_invitation', { p_invitation_id: invitation.id })
				.single<{ accept_status: unknown; accepted_organization_id: unknown }>();
			const row = result?.data;
			if (result?.error !== null || !row || typeof row !== 'object') throw new InvitationAcceptanceError(accepted);
			const status = row.accept_status;
			if (status === 'setup_required' && row.accepted_organization_id === null)
				throw new InvitationAcceptanceError(accepted, 'setup_required');
			if (status === 'not_found' && row.accepted_organization_id === null) {
				unavailable++;
				continue;
			}
			if (typeof row.accepted_organization_id !== 'string' || !row.accepted_organization_id.trim())
				throw new InvitationAcceptanceError(accepted);
			switch (status) {
				case 'accepted':
					accepted++;
					break;
				case 'already_member':
				case 'already_accepted':
					break;
				case 'expired':
				case 'blocked':
					unavailable++;
					break;
				default:
					throw new InvitationAcceptanceError(accepted);
			}
		}
		return { accepted, unavailable };
	} catch (error) {
		if (error instanceof InvitationAcceptanceError) throw error;
		throw new InvitationAcceptanceError(accepted);
	}
}
