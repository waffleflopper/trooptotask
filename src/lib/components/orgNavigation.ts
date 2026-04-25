import type { OrganizationMemberPermissions } from '$lib/types';

export type OrgNavIcon =
	| 'dashboard'
	| 'calendar'
	| 'personnel'
	| 'rating-scheme'
	| 'training'
	| 'critical-tasks'
	| 'onboarding'
	| 'leaders-book';

export interface OrgNavItem {
	id: string;
	href: string;
	label: string;
	breadcrumbLabel?: string;
	compactLabel?: string;
	badgeLabel?: string;
	icon: OrgNavIcon;
	visible: boolean;
	exactMatch: boolean;
}

export interface OrgBreadcrumb {
	label: string;
	href?: string;
}

const ORG_ROUTE_CHILD_BREADCRUMBS: Record<string, Record<string, string>> = {
	calendar: {
		assignments: 'Assignments',
		bulk: 'Bulk Status',
		'duty-roster': 'Duty Roster',
		reports: 'Reports',
		settings: 'Settings'
	},
	onboarding: {
		history: 'History',
		templates: 'Templates'
	},
	training: {
		reports: 'Reports',
		types: 'Types'
	},
	'critical-tasks': {
		library: 'Library',
		reports: 'Reports'
	}
};

const SUPPORT_ROUTE_BREADCRUMBS: Record<string, string> = {
	settings: 'Settings',
	billing: 'Billing'
};

const ADMIN_CHILD_BREADCRUMBS: Record<string, string> = {
	settings: 'Settings',
	approvals: 'Approvals',
	archived: 'Archived Personnel',
	audit: 'Audit'
};

const BILLING_CHILD_BREADCRUMBS: Record<string, string> = {
	success: 'Success',
	canceled: 'Canceled'
};

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
			id: 'rating-scheme',
			href: `/org/${orgId}/evals`,
			label: 'Evals',
			breadcrumbLabel: 'Evaluations',
			icon: 'rating-scheme',
			visible: permissions.canViewRatingScheme === true,
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
			visible: permissions.canViewCriticalTasks,
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
	const itemPath = item.href.split('?')[0];

	if (item.exactMatch) {
		return pathname === itemPath;
	}

	return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function getOrgBreadcrumbs(pathname: string, orgName: string, navItems: OrgNavItem[]): OrgBreadcrumb[] {
	const dashboardItem = navItems.find((item) => item.id === 'dashboard') ?? navItems[0];
	const orgCrumb: OrgBreadcrumb = { label: orgName, href: dashboardItem?.href };
	const supportBreadcrumbs = getSupportRouteBreadcrumbs(pathname, orgCrumb);

	if (supportBreadcrumbs) {
		return supportBreadcrumbs;
	}

	const activeItem = navItems.find((item) => isOrgNavItemActive(pathname, item)) ?? navItems[0];
	const activeLabel = activeItem?.breadcrumbLabel ?? activeItem?.label ?? 'Dashboard';
	const breadcrumbs: OrgBreadcrumb[] = [orgCrumb, { label: activeLabel }];

	if (!activeItem) return breadcrumbs;

	const itemPath = activeItem.href.split('?')[0];
	if (pathname === itemPath || !pathname.startsWith(`${itemPath}/`)) {
		return breadcrumbs;
	}

	breadcrumbs[1].href = activeItem.href;
	const childSegment = pathname.slice(itemPath.length + 1).split('/')[0];
	const childLabel =
		ORG_ROUTE_CHILD_BREADCRUMBS[activeItem.id]?.[childSegment] ??
		(activeItem.id === 'critical-tasks' && childSegment ? 'Person' : undefined);
	if (childLabel) {
		breadcrumbs.push({ label: childLabel });
	}

	return breadcrumbs;
}

function getSupportRouteBreadcrumbs(pathname: string, orgCrumb: OrgBreadcrumb): OrgBreadcrumb[] | null {
	const orgBasePath = orgCrumb.href;

	if (!orgBasePath || !pathname.startsWith(`${orgBasePath}/`)) {
		return null;
	}

	const segments = pathname
		.slice(orgBasePath.length + 1)
		.split('/')
		.filter(Boolean);
	const [primarySegment, childSegment] = segments;

	if (primarySegment === 'admin') {
		const childLabel = ADMIN_CHILD_BREADCRUMBS[childSegment ?? 'settings'];
		const breadcrumbs: OrgBreadcrumb[] = [orgCrumb, { label: 'Admin', href: `${orgBasePath}/admin` }];

		if (childLabel) {
			breadcrumbs.push({ label: childLabel });
		}

		return breadcrumbs;
	}

	const primaryLabel = SUPPORT_ROUTE_BREADCRUMBS[primarySegment];
	if (!primaryLabel) {
		return null;
	}

	const breadcrumbs: OrgBreadcrumb[] = [orgCrumb, { label: primaryLabel }];
	const childLabel = primarySegment === 'billing' ? BILLING_CHILD_BREADCRUMBS[childSegment] : undefined;

	if (childLabel) {
		breadcrumbs[1].href = `${orgBasePath}/${primarySegment}`;
		breadcrumbs.push({ label: childLabel });
	}

	return breadcrumbs;
}
