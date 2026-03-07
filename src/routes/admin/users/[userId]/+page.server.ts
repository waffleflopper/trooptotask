import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals }) => {
	const supabase = locals.supabase;
	const adminClient = getAdminClient();
	const { userId } = params;

	// Get user email from auth
	const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId);
	if (authError || !authUser?.user) {
		throw error(404, 'User not found');
	}

	// Get user's organizations
	const { data: organizations } = await supabase
		.from('organization_memberships')
		.select('organization_id, role, organizations(id, name)')
		.eq('user_id', userId);

	return {
		user: {
			id: userId,
			email: authUser.user.email || 'No email',
			createdAt: authUser.user.created_at
		},
		organizations: (organizations ?? []).map((o: any) => ({
			id: o.organizations?.id,
			name: o.organizations?.name,
			role: o.role
		}))
	};
};
