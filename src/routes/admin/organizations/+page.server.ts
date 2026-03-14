import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAdminRole, canAccessPage } from '$lib/server/admin';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, supabase } = locals;
	if (!user) throw error(401, 'Not authenticated');

	const role = await getAdminRole(supabase, user.id);
	if (!role || !canAccessPage(role, 'organizations')) throw error(403, 'Not authorized');

	const adminClient = getAdminClient();

	const { data: orgs, error: orgsError } = await adminClient
		.from('organizations')
		.select('id, name, tier, gift_tier, suspended_at, created_at, demo_type')
		.is('demo_type', null)
		.order('created_at', { ascending: false });

	if (orgsError) {
		console.error('Admin orgs query failed:', orgsError.message);
	}

	// Enrich with member counts, personnel counts, and owner email
	const enrichedOrgs = await Promise.all(
		(orgs ?? []).map(async (org) => {
			const { count: memberCount } = await adminClient
				.from('organization_memberships')
				.select('*', { count: 'exact', head: true })
				.eq('organization_id', org.id);

			const { count: personnelCount } = await adminClient
				.from('personnel')
				.select('*', { count: 'exact', head: true })
				.eq('organization_id', org.id)
				.is('archived_at', null);

			// Get owner email
			const { data: ownerMembership } = await adminClient
				.from('organization_memberships')
				.select('user_id')
				.eq('organization_id', org.id)
				.eq('role', 'owner')
				.single();

			let ownerEmail = '';
			if (ownerMembership) {
				const {
					data: { user: ownerUser }
				} = await adminClient.auth.admin.getUserById(ownerMembership.user_id);
				ownerEmail = ownerUser?.email ?? '';
			}

			return {
				...org,
				effectiveTier: (org.gift_tier ?? org.tier ?? 'free') as string,
				memberCount: memberCount ?? 0,
				personnelCount: personnelCount ?? 0,
				ownerEmail,
				isSuspended: !!org.suspended_at
			};
		})
	);

	return { organizations: enrichedOrgs };
};
