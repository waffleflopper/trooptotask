import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAdminRole, canAccessPage } from '$lib/server/admin';
import { getAdminClient } from '$lib/server/supabase';
import { queryPersonnel } from '$lib/server/personnelRepository';

export const load: PageServerLoad = async ({ locals }) => {
	const { user, supabase } = locals;
	if (!user) throw error(401, 'Not authenticated');

	const role = await getAdminRole(supabase, user.id);
	if (!role || !canAccessPage(role, 'subscriptions')) throw error(403, 'Not authorized');

	const adminClient = getAdminClient();

	const { data: orgs, error: orgsError } = await adminClient
		.from('organizations')
		.select('id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at')
		.is('demo_type', null)
		.order('created_at', { ascending: false });

	if (orgsError) {
		console.error('Admin subscriptions query failed:', orgsError.message);
	}

	const tierCaps: Record<string, number | null> = { free: 15, team: 80, unit: null };

	const enrichedOrgs = await Promise.all(
		(orgs ?? []).map(async (org) => {
			const { count: personnelCount } = await queryPersonnel({
				supabase: adminClient,
				orgId: org.id,
				headOnly: true,
				count: 'exact'
			});

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

			const effectiveTier = (org.gift_tier ?? org.tier ?? 'free') as string;

			return {
				...org,
				effectiveTier,
				personnelCount: personnelCount ?? 0,
				personnelCap: tierCaps[effectiveTier] ?? null,
				ownerEmail,
				isGifted: !!org.gift_tier,
				isSuspended: !!org.suspended_at
			};
		})
	);

	return { subscriptions: enrichedOrgs };
};
