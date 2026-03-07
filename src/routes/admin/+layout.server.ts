import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isPlatformAdmin, getAdminRole } from '$lib/server/admin';
import type { AdminRole } from '$lib/server/admin';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login');

	// Check if user is a platform admin
	const isAdmin = await isPlatformAdmin(locals.supabase, user.id);
	if (!isAdmin) {
		throw error(403, 'Access denied. Platform admin required.');
	}

	// Get admin role
	const role = await getAdminRole(locals.supabase, user.id);

	return {
		adminUserId: user.id,
		adminEmail: user.email,
		adminRole: role as AdminRole
	};
};
