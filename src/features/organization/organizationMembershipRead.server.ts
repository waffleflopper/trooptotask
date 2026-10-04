import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertNormalizedMembershipRow, type MembershipRow } from '$lib/server/permissionContext';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

/** Stored access facts for the admitted account; Delivery owns request-level reuse. */
export async function readOrganizationMembershipAccess(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<MembershipRow> {
	const { data, error: membershipError } = await supabase
		.from('organization_memberships')
		.select('id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids')
		.eq('user_id', userId)
		.eq('organization_id', orgId)
		.maybeSingle();

	if (membershipError) {
		console.error('[organization-membership] Failed to load membership row:', sanitizeErrorForLog(membershipError));
		error(500, 'Internal server error');
	}
	if (!data) error(403, 'You are not a member of this organization');
	assertNormalizedMembershipRow(data);
	return data as MembershipRow;
}

/** Setup support needs an estimated total, with only one membership ID transferred. */
export async function countOrganizationMembers(supabase: SupabaseClient, orgId: string): Promise<number> {
	const { count, error: countError } = await supabase
		.from('organization_memberships')
		.select('id', { count: 'estimated' })
		.eq('organization_id', orgId)
		.range(0, 0);
	if (countError) throw new Error(countError.message);
	return count ?? 0;
}
