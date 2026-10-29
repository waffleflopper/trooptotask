import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '$lib/server/database';
import type { OrganizationMembershipFacts } from '$lib/access/memberAccessProjection';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

/** Stored grants and SQL coverage for the signed-in account; Delivery owns request-level reuse. */
export async function readOrganizationMembershipAccess(
	supabase: SupabaseClient,
	_userId: string,
	orgId: string
): Promise<OrganizationMembershipFacts> {
	const { data, error: membershipError } = await supabase
		.rpc('read_request_member_access', {
			p_organization_id: orgId
		})
		.maybeSingle();

	if (membershipError) {
		console.error('[organization-membership] Failed to load membership row:', sanitizeErrorForLog(membershipError));
		error(500, 'Internal server error');
	}
	if (!data) error(403, 'You are not a member of this organization');
	assertNormalizedMembershipFacts(data);
	return data;
}

export async function readOrganizationMembershipForRequest(
	supabase: SupabaseClient,
	_userId: string,
	orgId: string
): Promise<OrganizationMembershipFacts> {
	const { data } = await supabase
		.rpc('read_request_member_access', {
			p_organization_id: orgId
		})
		.single();

	if (!data) error(403, 'Not a member of this organization');
	assertNormalizedMembershipFacts(data);
	return data;
}

function assertNormalizedMembershipFacts(
	data: Record<string, unknown>
): asserts data is Record<string, unknown> & OrganizationMembershipFacts {
	if (data.role === 'owner' || data.role === 'admin') return;
	const preset = data.member_preset;
	if (data.role !== 'member' || (preset !== 'viewer' && preset !== 'operator' && preset !== 'editor')) {
		error(500, 'Membership row is missing normalized member access storage');
	}
}
