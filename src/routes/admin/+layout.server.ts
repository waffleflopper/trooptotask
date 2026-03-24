import type { LayoutServerLoad } from './$types';
import { getAccessiblePages } from '$lib/server/admin';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';

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

export const load: LayoutServerLoad = loadWithAdminContext({
	fn: async (ctx, event) => {
		const { adminUser } = ctx;
		const accessiblePages = getAccessiblePages(adminUser.role);

		const visibleNavGroups = NAV_GROUPS.map((group) => ({
			...group,
			items: group.items.filter((item) => accessiblePages.includes(item.page))
		})).filter((group) => group.items.length > 0);

		return {
			adminUserId: adminUser.id,
			adminEmail: event.locals.user?.email,
			adminRole: adminUser.role,
			accessiblePages,
			visibleNavGroups
		};
	}
});
