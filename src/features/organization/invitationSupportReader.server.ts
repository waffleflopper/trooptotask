import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type {
	OrganizationPlatformInvitationReader,
	OrganizationSupportInvitationOriginFact
} from './invitationSupportTypes';

type OriginRow = Omit<OrganizationSupportInvitationOriginFact, 'organizations'> & {
	access_request_id: string;
	organizations:
		| OrganizationSupportInvitationOriginFact['organizations']
		| NonNullable<OrganizationSupportInvitationOriginFact['organizations']>[];
};

/** Organization owns invitation provenance; Identity supplies account labels separately. */
export function createOrganizationPlatformInvitationReader(
	client: SupabaseClient
): OrganizationPlatformInvitationReader {
	return {
		async listInvitationOrigins(accessRequestIds, options) {
			const origins = new Map<string, OrganizationSupportInvitationOriginFact[]>();
			const ids = [...new Set(accessRequestIds)];
			for (let offset = 0; offset < ids.length; offset += 200) {
				const batch = ids.slice(offset, offset + 200);
				const allowedIds = new Set(batch);
				const { data, error } = await selectAllSupabaseRows<OriginRow>(async (from, to) => {
					let query = client
						.from('access_request_organization_invitation_links')
						.select(
							'access_request_id, id, organization_invitation_id, organization_id, invited_by, invited_at, intended_membership_role, intended_member_preset, organizations(id, name)' +
								(options?.pendingOnly ? ',organization_invitations!inner(status)' : '')
						)
						.in('access_request_id', batch)
						.order('invited_at', { ascending: false })
						.order('id', { ascending: false });
					if (options?.pendingOnly) query = query.eq('organization_invitations.status', 'pending');
					const result = await query.range(from, to);
					if (!result.error && !Array.isArray(result.data)) throw new Error('Unable to read invitation origins');
					return result as unknown as { data: OriginRow[] | null; error: unknown };
				});
				if (error || !data) throw new Error('Unable to read invitation origins');
				for (const { access_request_id: requestId, organizations, ...origin } of data) {
					if (!allowedIds.has(requestId)) throw new Error('Unexpected invitation origin request');
					const requestOrigins = origins.get(requestId) ?? [];
					requestOrigins.push({
						...origin,
						organizations: Array.isArray(organizations) ? (organizations[0] ?? null) : organizations
					});
					origins.set(requestId, requestOrigins);
				}
			}
			return origins;
		}
	};
}
