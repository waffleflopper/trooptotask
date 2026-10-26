import type { CapabilityMap, DurableFeatureLane } from '$lib/access/memberAccessShape';
import { capabilityMeets } from '$lib/access/memberAccessShape';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { SETTINGS_PAGES } from '$features/organization/contracts';

export type OrgNavIcon =
	| 'dashboard'
	| 'calendar'
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
	children?: OrgNavSubItem[];
}

/** A page under a section. It stays current on every route that starts with one of its `routes`. */
export interface OrgNavSubItem {
	id: string;
	href: string;
	label: string;
	routes: string[];
	visible: boolean;
}

export interface OrgBreadcrumb {
	label: string;
	href?: string;
}

const ORG_ROUTE_CHILD_BREADCRUMBS: Record<string, Record<string, string>> = {
	calendar: {
		rosters: 'DA 6',
		bulk: 'Bulk Status',
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
		import: 'Import',
		library: 'Library',
		reports: 'Reports'
	},
	personnel: {
		import: 'Import'
	}
};

// Account belongs to the person, not the unit, so its trail leaves the unit name out.
const SUPPORT_ROUTE_BREADCRUMBS: Record<string, { label: string; children: Record<string, string>; personal?: true }> =
	{
		settings: {
			label: 'Unit settings',
			children: Object.fromEntries(Object.entries(SETTINGS_PAGES).map(([key, page]) => [key, page.label]))
		},
		account: {
			label: 'Account',
			children: { profile: 'Profile', security: 'Sign-in & security' },
			personal: true
		},
		'whats-new': { label: "What's new", children: {}, personal: true }
	};

export function getOrgNavigation(
	orgId: string,
	access: CapabilityMap,
	disabledFeatures: readonly FeatureKey[]
): OrgNavItem[] {
	const canView = (lane: DurableFeatureLane) => {
		return access[lane] !== 'none';
	};
	const calendarPath = `/org/${orgId}/calendar`;

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
			href: calendarPath,
			label: 'Calendar',
			icon: 'calendar',
			visible: canView('calendar'),
			exactMatch: false,
			children: [
				{
					id: 'events-taskings',
					href: `${calendarPath}/taskings`,
					label: 'Events & Taskings',
					routes: [`${calendarPath}/events`, `${calendarPath}/taskings`],
					visible: canView('calendar') && !disabledFeatures.includes('eventsAndTaskings')
				},
				{
					id: 'duty-planner',
					href: `${calendarPath}/assignments`,
					label: 'Duty planner',
					routes: [`${calendarPath}/assignments`],
					visible: capabilityMeets(access.calendar, POLICY_ACTION_CATALOG.calendar.manageAssignments.requiredCapability)
				}
			]
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

export function isOrgNavSubItemActive(pathname: string, item: Pick<OrgNavSubItem, 'routes'>): boolean {
	return item.routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
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
	const activeChild = activeItem.children?.find((child) => isOrgNavSubItemActive(pathname, child));
	if (activeChild) {
		breadcrumbs.push({ label: activeChild.label });
		return breadcrumbs;
	}

	const childSegment = pathname.slice(itemPath.length + 1).split('/')[0];
	const childLabel =
		ORG_ROUTE_CHILD_BREADCRUMBS[activeItem.id]?.[childSegment] ??
		(childSegment && personRecordCrumb(activeItem.id, routeLeafLabel));
	if (childLabel) {
		breadcrumbs.push({ label: childLabel });
	}

	return breadcrumbs;
}

function personRecordCrumb(itemId: string, routeLeafLabel: string | null | undefined): string | undefined {
	return itemId === 'personnel' || itemId === 'critical-tasks' ? (routeLeafLabel ?? 'Person') : undefined;
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

	const route = SUPPORT_ROUTE_BREADCRUMBS[primarySegment];
	if (!route) {
		return null;
	}

	const lead = route.personal ? [] : [orgCrumb];
	const childLabel = childSegment && route.children[childSegment];
	if (!childLabel) {
		return [...lead, { label: route.label }];
	}

	return [
		...lead,
		{
			label: route.label,
			href: `${orgBasePath}/${primarySegment === 'settings' ? 'settings/general' : primarySegment}`
		},
		{ label: childLabel }
	];
}
