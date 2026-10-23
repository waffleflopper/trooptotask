import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationMembershipFacts } from '$lib/access/memberAccessProjection';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

/** Stored access facts for the admitted account; Delivery owns request-level reuse. */
export async function readOrganizationMembershipAccess(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<OrganizationMembershipFacts> {
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
	assertNormalizedMembershipFacts(data);
	return data as OrganizationMembershipFacts;
}

export async function readOrganizationMembershipForRequest(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<OrganizationMembershipFacts> {
	const { data } = await supabase
		.from('organization_memberships')
		.select('id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!data) error(403, 'Not a member of this organization');
	assertNormalizedMembershipFacts(data);
	return data as OrganizationMembershipFacts;
}

function assertNormalizedMembershipFacts(data: Record<string, unknown>): void {
	if (data.role === 'owner' || data.role === 'admin') return;
	const preset = data.member_preset;
	if (preset !== 'viewer' && preset !== 'operator' && preset !== 'editor') {
		error(500, 'Membership row is missing normalized member access storage');
	}
}
