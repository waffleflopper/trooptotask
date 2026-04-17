import type { OrganizationMemberPermissions } from '$lib/types';

export type OrgNavIcon =
	| 'dashboard'
	| 'calendar'
	| 'personnel'
	| 'training'
	| 'critical-tasks'
	| 'onboarding'
	| 'leaders-book';

export interface OrgNavItem {
	id: string;
	href: string;
	label: string;
	compactLabel?: string;
	badgeLabel?: string;
	icon: OrgNavIcon;
	visible: boolean;
	exactMatch: boolean;
}

export function getOrgNavigation(orgId: string, permissions: OrganizationMemberPermissions): OrgNavItem[] {
	return [
		{
			id: 'dashboard',
			href: `/org/${orgId}`,
			label: 'Dashboard',
			compactLabel: 'Home',
			icon: 'dashboard',
			visible: true,
			exactMatch: true
		},
		{
			id: 'calendar',
			href: `/org/${orgId}/calendar`,
			label: 'Calendar',
			icon: 'calendar',
			visible: permissions.canViewCalendar,
			exactMatch: false
		},
		{
			id: 'personnel',
			href: `/org/${orgId}/personnel`,
			label: 'Personnel',
			icon: 'personnel',
			visible: permissions.canViewPersonnel,
			exactMatch: false
		},
		{
			id: 'training',
			href: `/org/${orgId}/training`,
			label: 'Training',
			icon: 'training',
			visible: permissions.canViewTraining,
			exactMatch: false
		},
		{
			id: 'critical-tasks',
			href: `/org/${orgId}/critical-tasks`,
			label: 'Critical Tasks',
			compactLabel: 'ICTLs',
			badgeLabel: 'Beta',
			icon: 'critical-tasks',
			visible: permissions.canViewTraining,
			exactMatch: false
		},
		{
			id: 'onboarding',
			href: `/org/${orgId}/onboarding`,
			label: 'Onboarding',
			compactLabel: 'Onboard',
			icon: 'onboarding',
			visible: permissions.canViewOnboarding,
			exactMatch: false
		},
		// Leaders Book temporarily hidden during redesign.
		{
			id: 'leaders-book',
			href: `/org/${orgId}/leaders-book`,
			label: "Leader's Book",
			compactLabel: 'LB',
			icon: 'leaders-book',
			visible: false,
			exactMatch: false
		}
	];
}

export function isOrgNavItemActive(pathname: string, item: OrgNavItem): boolean {
	if (item.exactMatch) {
		return pathname === item.href;
	}

	return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
