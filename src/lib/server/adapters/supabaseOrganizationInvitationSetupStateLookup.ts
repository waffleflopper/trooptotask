import type { SupabaseClient } from '@supabase/supabase-js';
import {
	resolveAccessRequestSetupState,
	type AccessRequestAuthEmailOutbox,
	type AccessRequestSetupLink,
	type AccessRequestSetupState
} from '$features/identity/index.server';
import type { OrganizationInvitationSetupStateLookupPort } from '$lib/server/core/ports';

const SETUP_STATE_SELECT =
	'organization_invitation_id, access_requests(setup_completed_at, account_setup_links(id, created_at, expires_at, claimed_at, failed_at, failure_reason, used_at, revoked_at, revocation_reason), auth_email_outbox(id, setup_link_id, status, attempt_count, last_error, created_at, updated_at, sent_at))';

interface InvitationSetupStateRow {
	organization_invitation_id: string;
	access_requests: AccessRequestSetupSourceRow | AccessRequestSetupSourceRow[] | null;
}

interface AccessRequestSetupSourceRow {
	setup_completed_at: string | null;
	account_setup_links: AccessRequestSetupLink | AccessRequestSetupLink[] | null;
	auth_email_outbox: AccessRequestAuthEmailOutbox | AccessRequestAuthEmailOutbox[] | null;
}

/**
 * Reads Account Setup state for an Organization's own pending Organization Invitations.
 *
 * Service-role because `access_requests` and its link table are readable only under
 * `is_platform_admin()`. The query is constrained to the calling Organization's invitation
 * links, and only the derived setup state leaves this adapter — see ADR 0012.
 */
export function createSupabaseOrganizationInvitationSetupStateLookupPort(
	getAdminClient: () => SupabaseClient
): OrganizationInvitationSetupStateLookupPort {
	return {
		async findSetupStateByInvitationId(
			orgId: string,
			invitationIds: string[]
		): Promise<Map<string, AccessRequestSetupState>> {
			if (invitationIds.length === 0) return new Map();

			const { data, error } = await getAdminClient()
				.from('access_request_organization_invitation_links')
				.select(SETUP_STATE_SELECT)
				.eq('organization_id', orgId)
				.in('organization_invitation_id', invitationIds);

			if (error) {
				throw new Error(error.message);
			}

			const resolvedAt = new Date();
			const states = new Map<string, AccessRequestSetupState>();
			for (const row of (data ?? []) as unknown as InvitationSetupStateRow[]) {
				const request = Array.isArray(row.access_requests) ? row.access_requests[0] : row.access_requests;
				if (!request) continue;
				states.set(row.organization_invitation_id, resolveAccessRequestSetupState(request, resolvedAt));
			}

			return states;
		}
	};
}
