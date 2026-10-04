import type { LayoutServerLoad } from './$types';
import { loadPlatformAdminNavigation } from '$features/platform-admin/index.server';

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
	{
		label: 'SYSTEM',
		items: [
			{ label: 'Audit Log', href: '/admin/audit', page: 'audit' },
			{ label: 'Announcements', href: '/admin/announcements', page: 'announcements' }
		]
	}
] as const;

export const load: LayoutServerLoad = async (event) => {
	const navigation = await loadPlatformAdminNavigation(event);
	const visibleNavGroups = NAV_GROUPS.map((group) => ({
		...group,
		items: group.items.filter((item) => navigation.accessiblePages.includes(item.page))
	})).filter((group) => group.items.length > 0);
	return { ...navigation, visibleNavGroups };
};
