/** The five sections of the platform admin. `matches` lists the path prefixes that keep a section selected. */
export const ADMIN_SECTIONS = [
	{ key: 'inbox', label: 'Inbox', href: '/admin', matches: [] },
	{ key: 'organizations', label: 'Organizations', href: '/admin/organizations', matches: ['/admin/organizations'] },
	{ key: 'people', label: 'People', href: '/admin/people', matches: ['/admin/people', '/admin/users'] },
	{ key: 'activity', label: 'Activity', href: '/admin/activity', matches: ['/admin/activity', '/admin/audit'] },
	{
		key: 'announcements',
		label: 'Announcements',
		href: '/admin/announcements',
		matches: ['/admin/announcements']
	}
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

function underPrefix(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAdminSectionActive(section: AdminSection, pathname: string): boolean {
	if (section.key === 'inbox') return pathname === '/admin';
	return section.matches.some((prefix) => underPrefix(pathname, prefix));
}
