import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isPlatformAdmin, getAdminRole, getAccessiblePages } from '$lib/server/admin';
import type { AdminRole } from '$lib/server/admin';

const NAV_GROUPS = [
	{ label: null, items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }] },
	{
		label: 'SUPPORT',
		items: [
			{ label: 'Users', href: '/admin/users', page: 'users' },
			{ label: 'Organizations', href: '/admin/organizations', page: 'organizations' },
			{ label: 'Access Requests', href: '/admin/access-requests', page: 'access-requests' },
			{ label: 'Feedback', href: '/admin/feedback', page: 'feedback' }
		]
	},
	{ label: 'BILLING', items: [{ label: 'Subscriptions', href: '/admin/subscriptions', page: 'subscriptions' }] },
	{
		label: 'SYSTEM',
		items: [
			{ label: 'Audit Log', href: '/admin/audit', page: 'audit' },
			{ label: 'Announcements', href: '/admin/announcements', page: 'announcements' }
		]
	}
];

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
	if (!role) {
		throw error(403, 'Unable to determine admin role.');
	}
	const adminRole = role;

	const accessiblePages = getAccessiblePages(adminRole);

	// Pre-compute visible nav groups server-side to avoid hydration issues
	const visibleNavGroups = NAV_GROUPS.map((group) => ({
		...group,
		items: group.items.filter((item) => accessiblePages.includes(item.page))
	})).filter((group) => group.items.length > 0);

	return {
		adminUserId: user.id,
		adminEmail: user.email,
		adminRole,
		accessiblePages,
		visibleNavGroups
	};
};
