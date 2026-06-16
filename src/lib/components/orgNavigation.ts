import type { CapabilityMap, DurableFeatureLane } from '$lib/access/memberAccessShape';

export type OrgNavIcon =
	| 'dashboard'
	| 'calendar'
	| 'duty-roster'
	| 'personnel'
	| 'rating-scheme'
	| 'training'
	| 'critical-tasks'
	| 'onboarding';

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
	},
	'duty-rosters': {
		new: 'New Template'
	}
};

const SUPPORT_ROUTE_BREADCRUMBS: Record<string, string> = {
	settings: 'Settings',
	billing: 'Billing'
};

const BILLING_CHILD_BREADCRUMBS: Record<string, string> = {
	success: 'Success',
	canceled: 'Canceled'
};

export function getOrgNavigation(orgId: string, access: CapabilityMap): OrgNavItem[] {
	const canView = (lane: DurableFeatureLane) => {
		return access[lane] !== 'none';
	};

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
			visible: canView('calendar'),
			exactMatch: false
		},
		{
			id: 'duty-rosters',
			href: `/org/${orgId}/duty-rosters`,
			label: 'Duty Rosters',
			badgeLabel: 'Beta',
			icon: 'duty-roster',
			visible: canView('calendar'),
			exactMatch: false
		},
		{
			id: 'personnel',
			href: `/org/${orgId}/personnel`,
			label: 'Personnel',
			icon: 'personnel',
			visible: canView('personnel'),
			exactMatch: false
		},
		{
			id: 'rating-scheme',
			href: `/org/${orgId}/evals`,
			label: 'Evals',
			breadcrumbLabel: 'Evaluations',
			icon: 'rating-scheme',
			visible: canView('ratingScheme'),
			exactMatch: false
		},
		{
			id: 'training',
			href: `/org/${orgId}/training`,
			label: 'Training',
			icon: 'training',
			visible: canView('training'),
			exactMatch: false
		},
		{
			id: 'critical-tasks',
			href: `/org/${orgId}/critical-tasks`,
			label: 'Critical Tasks',
			compactLabel: 'ICTLs',
			icon: 'critical-tasks',
			visible: canView('criticalTasks'),
			exactMatch: false
		},
		{
			id: 'onboarding',
			href: `/org/${orgId}/onboarding`,
			label: 'Onboarding',
			compactLabel: 'Onboard',
			icon: 'onboarding',
			visible: canView('onboarding'),
			exactMatch: false
		}
	];
}

export function isOrgNavItemActive(pathname: string, item: Pick<OrgNavItem, 'href' | 'exactMatch'>): boolean {
	const itemPath = item.href.split('?')[0];

	if (item.exactMatch) {
		return pathname === itemPath;
	}

	return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function getOrgBreadcrumbs(
	pathname: string,
	orgName: string,
	navItems: OrgNavItem[],
	routeLeafLabel?: string | null
): OrgBreadcrumb[] {
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
	if (activeItem.id === 'dashboard' && pathname === itemPath && routeLeafLabel) {
		breadcrumbs[1].href = activeItem.href;
		breadcrumbs.push({ label: routeLeafLabel });
		return breadcrumbs;
	}

	if (pathname === itemPath || !pathname.startsWith(`${itemPath}/`)) {
		return breadcrumbs;
	}

	breadcrumbs[1].href = activeItem.href;
	const childSegment = pathname.slice(itemPath.length + 1).split('/')[0];
	if (activeItem.id === 'duty-rosters' && childSegment && childSegment !== 'new' && routeLeafLabel) {
		breadcrumbs.push({ label: routeLeafLabel });
		return breadcrumbs;
	}

	const childLabel =
		ORG_ROUTE_CHILD_BREADCRUMBS[activeItem.id]?.[childSegment] ??
		(activeItem.id === 'critical-tasks' && childSegment ? (routeLeafLabel ?? 'Person') : undefined);
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
