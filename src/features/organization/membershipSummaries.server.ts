import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { getPreferredOrganizationUrlSegment } from './url';
import type { OrganizationMembershipSummary } from './profileTypes';

interface OrganizationMembershipRow {
	role: string;
	organizations: { id: string; name: string; url_slug: string | null } | null;
}

/** Ordinary request-scoped membership/profile projection for Dashboard and deferred chrome. */
export async function readOrganizationMembershipSummaries(
	supabase: SupabaseClient,
	userId: string
): Promise<{ data: OrganizationMembershipSummary[] | null; error: unknown }> {
	const { data, error } = await selectAllSupabaseRows<OrganizationMembershipRow>(
		(from, to) =>
			supabase
				.from('organization_memberships')
				.select('role, organizations(id, name, url_slug)')
				.eq('user_id', userId)
				.order('organization_id')
				.order('id')
				.range(from, to) as unknown as Promise<{ data: OrganizationMembershipRow[] | null; error: unknown }>
	);
	if (error || !data) return { data: null, error };
	return {
		data: data.flatMap(({ role, organizations: organization }) =>
			organization
				? [
						{
							id: organization.id,
							name: organization.name,
							role,
							urlSegment: getPreferredOrganizationUrlSegment({ id: organization.id, urlSlug: organization.url_slug })
						}
					]
				: []
		),
		error: null
	};
}
