import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isPlatformAdmin, getAdminRole } from '$lib/server/subscription';
import type { AdminRole } from '$lib/types/subscription';
import { isBillingEnabled } from '$lib/config/billing';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!isBillingEnabled) {
		throw redirect(303, '/dashboard');
	}

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
