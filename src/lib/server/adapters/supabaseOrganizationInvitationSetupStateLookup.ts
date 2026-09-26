import type { SupabaseClient } from '@supabase/supabase-js';
import {
	resolveAccessRequestSetupState,
	type AccessRequestAuthEmailOutbox,
	type AccessRequestSetupLink,
	type AccessRequestSetupState
} from '$features/identity/index.server';
import type { OrganizationInvitationSetupStateLookupPort } from '$lib/server/core/ports';

const SETUP_STATE_SELECT =
	'organization_invitation_id, access_requests(email, setup_completed_at, account_setup_links(id, created_at, expires_at, claimed_at, failed_at, failure_reason, used_at, revoked_at, revocation_reason), auth_email_outbox(id, setup_link_id, status, attempt_count, last_error, created_at, updated_at, sent_at))';

interface InvitationSetupStateRow {
	organization_invitation_id: string;
	access_requests: AccessRequestSetupSourceRow | AccessRequestSetupSourceRow[] | null;
}

interface AccessRequestSetupSourceRow {
	email: string;
	setup_completed_at: string | null;
	account_setup_links: AccessRequestSetupLink | AccessRequestSetupLink[] | null;
	auth_email_outbox: AccessRequestAuthEmailOutbox | AccessRequestAuthEmailOutbox[] | null;
}

interface HeldClaimRow {
	access_requests: { email: string } | { email: string }[] | null;
}

/**
 * Reads Account Setup state for an Organization's own pending Organization Invitations.
 *
 * Service-role because `access_requests` and its link table are readable only under
 * `is_platform_admin()`. The invitation query is constrained to the calling Organization;
 * the held-claim query is batched by those invitees' emails. Only derived setup state
 * leaves this adapter — see ADR 0012.
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

			const adminClient = getAdminClient();
			const { data, error } = await adminClient
				.from('access_request_organization_invitation_links')
				.select(SETUP_STATE_SELECT)
				.eq('organization_id', orgId)
				.in('organization_invitation_id', invitationIds);

			if (error) {
				throw new Error(error.message);
			}

			const requests = ((data ?? []) as unknown as InvitationSetupStateRow[])
				.map((row) => ({
					invitationId: row.organization_invitation_id,
					request: Array.isArray(row.access_requests) ? row.access_requests[0] : row.access_requests
				}))
				.filter((row): row is { invitationId: string; request: AccessRequestSetupSourceRow } => Boolean(row.request));
			const resolvedAt = new Date();
			const states = new Map<string, AccessRequestSetupState>();
			for (const { invitationId, request } of requests) {
				states.set(invitationId, resolveAccessRequestSetupState(request, resolvedAt));
			}
			const emails = [
				...new Set(
					requests
						.filter(({ invitationId }) => states.get(invitationId) !== 'completed')
						.map(({ request }) => request.email.trim().toLowerCase())
				)
			];
			const heldClaimEmails = new Set<string>();
			if (emails.length > 0) {
				// One email-scoped lookup catches a claim on an older or different Access Request.
				const { data: heldClaims, error: heldClaimError } = await adminClient
					.from('account_setup_links')
					.select('access_requests!inner(email)')
					.not('claimed_at', 'is', null)
					.is('failed_at', null)
					.is('used_at', null)
					.in('access_requests.email', emails);

				if (heldClaimError) throw new Error(heldClaimError.message);
				for (const row of (heldClaims ?? []) as unknown as HeldClaimRow[]) {
					const request = Array.isArray(row.access_requests) ? row.access_requests[0] : row.access_requests;
					if (request) heldClaimEmails.add(request.email.trim().toLowerCase());
				}
			}

			for (const { invitationId, request } of requests) {
				if (states.get(invitationId) !== 'completed' && heldClaimEmails.has(request.email.trim().toLowerCase())) {
					states.set(invitationId, 'claimed');
				}
			}

			return states;
		}
	};
}
