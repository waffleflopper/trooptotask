import { describe, expect, it } from 'vitest';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { projectEffectiveMemberAccess } from '$lib/access/memberAccessProjection';
import {
	carryGroupFocus,
	getOrgBreadcrumbs,
	getOrgNavigation,
	isOrgNavItemActive,
	isOrgNavSubItemActive,
	type OrgNavItem
} from './orgNavigation';
import { SETUP_STEPS } from '$features/organization/contracts';

const baseCapabilities: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

describe('getOrgNavigation', () => {
	it('hides every switched-off feature from an owner', () => {
		const { capabilityMap } = projectEffectiveMemberAccess(
			{ role: 'owner' },
			{ disabledFeatures: ['training', 'criticalTasks', 'evaluations', 'onboarding'] }
		);

		expect(
			getOrgNavigation('alpha', capabilityMap, [])
				.filter((item) => item.visible)
				.map((item) => item.label)
		).toEqual(['Dashboard', 'Calendar', 'Personnel']);
	});

	it('builds generated organization links with the provided preferred URL segment', () => {
		const nav = getOrgNavigation(
			'1-11-bde',
			{
				...baseCapabilities,
				calendar: 'view'
			},
			[]
		);

		expect(nav.find((item) => item.id === 'dashboard')?.href).toBe('/org/1-11-bde');
		expect(nav.find((item) => item.id === 'calendar')?.href).toBe('/org/1-11-bde/calendar');
	});

	it('uses Capability Map view levels for shell navigation visibility', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				calendar: 'view',
				personnel: 'none',
				training: 'operate',
				criticalTasks: 'configure',
				onboarding: 'none',
				ratingScheme: 'view'
			},
			[]
		);

		expect(nav.find((item) => item.id === 'calendar')?.visible).toBe(true);
		expect(nav.find((item) => item.id === 'personnel')?.visible).toBe(false);
		expect(nav.find((item) => item.id === 'training')?.visible).toBe(true);
		expect(nav.find((item) => item.id === 'critical-tasks')?.visible).toBe(true);
		expect(nav.find((item) => item.id === 'onboarding')?.visible).toBe(false);
		expect(nav.find((item) => item.id === 'rating-scheme')?.visible).toBe(true);
	});

	it('shows Critical Tasks for critical tasks viewers and hides it without critical tasks view access', () => {
		const withCriticalTasks = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				criticalTasks: 'view'
			},
			[]
		);
		const withoutCriticalTasks = getOrgNavigation('org-1', baseCapabilities, []);

		expect(withCriticalTasks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'critical-tasks',
					href: '/org/org-1/critical-tasks',
					label: 'Critical Tasks',
					compactLabel: 'ICTLs',
					visible: true
				})
			])
		);
		expect(withCriticalTasks.find((item) => item.id === 'critical-tasks')).not.toHaveProperty('badgeLabel');
		expect(withoutCriticalTasks.find((item) => item.id === 'critical-tasks')?.visible).toBe(false);
	});

	it('treats Critical Tasks child routes as active for the nav item', () => {
		const item = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				criticalTasks: 'view'
			},
			[]
		).find((navItem) => navItem.id === 'critical-tasks');

		if (!item) {
			throw new Error('Critical Tasks nav item missing');
		}

		expect(isOrgNavItemActive('/org/org-1/critical-tasks/reports', item)).toBe(true);
	});

	it('shows an Evals nav item when the member can view rating scheme', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				personnel: 'view',
				ratingScheme: 'view'
			},
			[]
		);

		expect(nav).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'rating-scheme',
					href: '/org/org-1/evals',
					label: 'Evals',
					visible: true
				})
			])
		);
		expect(nav.find((item) => item.id === 'personnel')?.visible).toBe(true);
	});

	it('treats Evals child routes as active for the nav item', () => {
		const item = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				ratingScheme: 'view'
			},
			[]
		).find((navItem) => navItem.id === 'rating-scheme');

		if (!item) {
			throw new Error('Rating Scheme nav item missing');
		}

		expect(isOrgNavItemActive('/org/org-1/evals/reports', item)).toBe(true);
	});
});

describe('Calendar sub-items', () => {
	const visibleChildren = (calendar: CapabilityMap['calendar'], disabled: Parameters<typeof getOrgNavigation>[2]) =>
		getOrgNavigation('org-1', { ...baseCapabilities, calendar }, disabled)
			.find((item) => item.id === 'calendar')
			?.children?.filter((child) => child.visible)
			.map((child) => child.href);

	it('shows Events & Taskings to Calendar readers and the Duty planner only to Calendar operators', () => {
		expect(visibleChildren('view', [])).toEqual(['/org/org-1/calendar/taskings']);
		expect(visibleChildren('operate', [])).toEqual(['/org/org-1/calendar/taskings', '/org/org-1/calendar/assignments']);
		expect(visibleChildren('none', [])).toEqual([]);
	});

	it('hides Events & Taskings while its feature switch is off', () => {
		expect(visibleChildren('configure', ['eventsAndTaskings'])).toEqual(['/org/org-1/calendar/assignments']);
	});

	it('keeps Events & Taskings current on Event and Tasking pages and nowhere else in Calendar', () => {
		const eventsAndTaskings = { routes: ['/org/org-1/calendar/events', '/org/org-1/calendar/taskings'] };

		expect(isOrgNavSubItemActive('/org/org-1/calendar/taskings', eventsAndTaskings)).toBe(true);
		expect(isOrgNavSubItemActive('/org/org-1/calendar/taskings/t-1', eventsAndTaskings)).toBe(true);
		expect(isOrgNavSubItemActive('/org/org-1/calendar/events/e-1', eventsAndTaskings)).toBe(true);
		expect(isOrgNavSubItemActive('/org/org-1/calendar', eventsAndTaskings)).toBe(false);
		expect(isOrgNavSubItemActive('/org/org-1/calendar/eventsx', eventsAndTaskings)).toBe(false);
	});
});

describe('carryGroupFocus', () => {
	const owner = projectEffectiveMemberAccess({ role: 'owner' }, { disabledFeatures: [] }).capabilityMap;
	const nav = getOrgNavigation('org-1', owner, []);
	const hrefs = (items: OrgNavItem[]) => items.map((item) => item.href);

	it('keeps the reader’s Group focus on every Group-aware section link and nowhere else', () => {
		const carried = carryGroupFocus(nav, new URLSearchParams('group=sq-1&view=month'));

		expect(hrefs(carried)).toEqual([
			'/org/org-1?group=sq-1',
			'/org/org-1/calendar?group=sq-1',
			'/org/org-1/personnel?group=sq-1',
			'/org/org-1/evals?group=sq-1',
			'/org/org-1/training?group=sq-1',
			'/org/org-1/critical-tasks?group=sq-1',
			'/org/org-1/onboarding?group=sq-1'
		]);
		expect(carried.find((item) => item.id === 'calendar')?.children?.map((child) => child.href)).toEqual([
			'/org/org-1/calendar/taskings',
			'/org/org-1/calendar/assignments'
		]);
		expect(isOrgNavItemActive('/org/org-1', carried[0])).toBe(true);
	});

	it('leaves a link that does not follow focus alone, and every link bare without a focus', () => {
		const settings = { ...nav[0], id: 'settings', href: '/org/org-1/settings', followsGroupFocus: false };

		expect(hrefs(carryGroupFocus([settings], new URLSearchParams('group=unassigned')))).toEqual([
			'/org/org-1/settings'
		]);
		expect(hrefs(carryGroupFocus(nav, new URLSearchParams('view=month')))).toEqual(hrefs(nav));
	});
});

describe('getOrgBreadcrumbs', () => {
	it('names Events & Taskings under Calendar on its lists and detail pages', () => {
		const nav = getOrgNavigation('org-1', { ...baseCapabilities, calendar: 'view' }, []);

		expect(getOrgBreadcrumbs('/org/org-1/calendar/taskings', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Calendar', href: '/org/org-1/calendar' },
			{ label: 'Events & Taskings' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/calendar/events/e-1', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Calendar', href: '/org/org-1/calendar' },
			{ label: 'Events & Taskings' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/calendar/assignments', 'Test Org', nav).at(-1)).toEqual({
			label: 'Duty planner'
		});
	});

	it('names the open Organization setup step after the unit and links back into setup', () => {
		const nav = getOrgNavigation('org-1', { ...baseCapabilities, calendar: 'view' }, []);

		expect(getOrgBreadcrumbs('/org/org-1/setup/critical-tasks', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Organization setup', href: '/org/org-1/setup' },
			{ label: SETUP_STEPS.find((step) => step.slug === 'critical-tasks')!.title }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/setup/done', 'Test Org', nav).at(-1)).toEqual({ label: 'Done' });
	});

	it("labels the What's new page without the unit, since the page is personal", () => {
		const nav = getOrgNavigation('org-1', { ...baseCapabilities, calendar: 'view' }, []);
		expect(getOrgBreadcrumbs('/org/org-1/whats-new', 'Test Org', nav)).toEqual([{ label: "What's new" }]);
	});

	it('includes Calendar subroute labels after the organization and primary section', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				calendar: 'view'
			},
			[]
		);

		expect(getOrgBreadcrumbs('/org/org-1/calendar/settings', 'Test Org', nav).map((crumb) => crumb.label)).toEqual([
			'Test Org',
			'Calendar',
			'Settings'
		]);
	});

	it('links parent breadcrumbs for Calendar subroutes', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				calendar: 'view'
			},
			[]
		);

		expect(getOrgBreadcrumbs('/org/org-1/calendar/settings', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Calendar', href: '/org/org-1/calendar' },
			{ label: 'Settings' }
		]);
	});

	it('includes linked Onboarding subroute breadcrumbs', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				onboarding: 'view'
			},
			[]
		);

		expect(getOrgBreadcrumbs('/org/org-1/onboarding/templates', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Onboarding', href: '/org/org-1/onboarding' },
			{ label: 'Templates' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/onboarding/history', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Onboarding', href: '/org/org-1/onboarding' },
			{ label: 'History' }
		]);
	});

	it('includes linked Training subroute breadcrumbs', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				training: 'view'
			},
			[]
		);

		expect(getOrgBreadcrumbs('/org/org-1/training/types', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Training', href: '/org/org-1/training' },
			{ label: 'Types' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/training/reports', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Training', href: '/org/org-1/training' },
			{ label: 'Reports' }
		]);
	});

	it('includes linked Critical Tasks subroute breadcrumbs', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				criticalTasks: 'view'
			},
			[]
		);

		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/library', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'Library' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/reports', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'Reports' }
		]);
	});

	it('uses a personnel breadcrumb for Critical Tasks person records', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				criticalTasks: 'view'
			},
			[]
		);

		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/person-1', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'Person' }
		]);
	});

	it('names a Personnel record by its route label on every detail tab', () => {
		const nav = getOrgNavigation('org-1', { ...baseCapabilities, personnel: 'operate' }, []);

		for (const path of ['/org/org-1/personnel/okafor-daniel', '/org/org-1/personnel/okafor-daniel/log']) {
			expect(getOrgBreadcrumbs(path, 'Test Org', nav, 'Okafor, Daniel')).toEqual([
				{ label: 'Test Org', href: '/org/org-1' },
				{ label: 'Personnel', href: '/org/org-1/personnel' },
				{ label: 'Okafor, Daniel' }
			]);
		}
		expect(getOrgBreadcrumbs('/org/org-1/personnel/import', 'Test Org', nav).at(-1)).toEqual({ label: 'Import' });
	});

	it('uses a route-provided personnel label for Critical Tasks person records', () => {
		const nav = getOrgNavigation(
			'org-1',
			{
				...baseCapabilities,
				criticalTasks: 'view'
			},
			[]
		);

		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/person-1', 'Test Org', nav, 'CPT Hayes, Emma')).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'CPT Hayes, Emma' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/import', 'Test Org', nav, 'Ignored')).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'Import' }
		]);
	});

	it('names Unit settings and the settings page outside primary navigation', () => {
		const nav = getOrgNavigation('org-1', baseCapabilities, []);

		expect(getOrgBreadcrumbs('/org/org-1/settings/danger', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Unit settings', href: '/org/org-1/settings/general' },
			{ label: 'Danger zone' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/settings', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Unit settings' }
		]);
	});

	it('names the account section without the unit, since the account is personal', () => {
		const nav = getOrgNavigation('org-1', baseCapabilities, []);

		expect(getOrgBreadcrumbs('/org/org-1/account/security', 'Test Org', nav)).toEqual([
			{ label: 'Account', href: '/org/org-1/account' },
			{ label: 'Sign-in & security' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/account/profile', 'Test Org', nav)).toEqual([
			{ label: 'Account', href: '/org/org-1/account' },
			{ label: 'Profile' }
		]);
	});
});
