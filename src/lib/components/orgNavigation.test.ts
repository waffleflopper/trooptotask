import { describe, expect, it } from 'vitest';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { getOrgBreadcrumbs, getOrgNavigation, isOrgNavItemActive } from './orgNavigation';

const baseCapabilities: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

describe('getOrgNavigation', () => {
	it('builds generated organization links with the provided preferred URL segment', () => {
		const nav = getOrgNavigation('1-11-bde', {
			...baseCapabilities,
			calendar: 'view'
		});

		expect(nav.find((item) => item.id === 'dashboard')?.href).toBe('/org/1-11-bde');
		expect(nav.find((item) => item.id === 'calendar')?.href).toBe('/org/1-11-bde/calendar');
	});

	it('uses Capability Map view levels for shell navigation visibility', () => {
		const nav = getOrgNavigation('org-1', {
			calendar: 'view',
			personnel: 'none',
			training: 'operate',
			criticalTasks: 'configure',
			onboarding: 'none',
			ratingScheme: 'view'
		});

		expect(nav.find((item) => item.id === 'calendar')?.visible).toBe(true);
		expect(nav.find((item) => item.id === 'personnel')?.visible).toBe(false);
		expect(nav.find((item) => item.id === 'training')?.visible).toBe(true);
		expect(nav.find((item) => item.id === 'critical-tasks')?.visible).toBe(true);
		expect(nav.find((item) => item.id === 'onboarding')?.visible).toBe(false);
		expect(nav.find((item) => item.id === 'rating-scheme')?.visible).toBe(true);
	});

	it('shows Critical Tasks for critical tasks viewers and hides it without critical tasks view access', () => {
		const withCriticalTasks = getOrgNavigation('org-1', {
			...baseCapabilities,
			criticalTasks: 'view'
		});
		const withoutCriticalTasks = getOrgNavigation('org-1', baseCapabilities);

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
		const item = getOrgNavigation('org-1', {
			...baseCapabilities,
			criticalTasks: 'view'
		}).find((navItem) => navItem.id === 'critical-tasks');

		if (!item) {
			throw new Error('Critical Tasks nav item missing');
		}

		expect(isOrgNavItemActive('/org/org-1/critical-tasks/reports', item)).toBe(true);
	});

	it('shows an Evals nav item when the member can view rating scheme', () => {
		const nav = getOrgNavigation('org-1', {
			...baseCapabilities,
			personnel: 'view',
			ratingScheme: 'view'
		});

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
		const item = getOrgNavigation('org-1', {
			...baseCapabilities,
			ratingScheme: 'view'
		}).find((navItem) => navItem.id === 'rating-scheme');

		if (!item) {
			throw new Error('Rating Scheme nav item missing');
		}

		expect(isOrgNavItemActive('/org/org-1/evals/reports', item)).toBe(true);
	});
});

describe('getOrgBreadcrumbs', () => {
	it('includes Calendar subroute labels after the organization and primary section', () => {
		const nav = getOrgNavigation('org-1', {
			...baseCapabilities,
			calendar: 'view'
		});

		expect(getOrgBreadcrumbs('/org/org-1/calendar/settings', 'Test Org', nav).map((crumb) => crumb.label)).toEqual([
			'Test Org',
			'Calendar',
			'Settings'
		]);
	});

	it('links parent breadcrumbs for Calendar subroutes', () => {
		const nav = getOrgNavigation('org-1', {
			...baseCapabilities,
			calendar: 'view'
		});

		expect(getOrgBreadcrumbs('/org/org-1/calendar/settings', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Calendar', href: '/org/org-1/calendar' },
			{ label: 'Settings' }
		]);
	});

	it('includes linked Onboarding subroute breadcrumbs', () => {
		const nav = getOrgNavigation('org-1', {
			...baseCapabilities,
			onboarding: 'view'
		});

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
		const nav = getOrgNavigation('org-1', {
			...baseCapabilities,
			training: 'view'
		});

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
		const nav = getOrgNavigation('org-1', {
			...baseCapabilities,
			criticalTasks: 'view'
		});

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
		const nav = getOrgNavigation('org-1', {
			...baseCapabilities,
			criticalTasks: 'view'
		});

		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/person-1', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'Person' }
		]);
	});

	it('uses a route-provided personnel label for Critical Tasks person records', () => {
		const nav = getOrgNavigation('org-1', {
			...baseCapabilities,
			criticalTasks: 'view'
		});

		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/person-1', 'Test Org', nav, 'CPT Hayes, Emma')).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'CPT Hayes, Emma' }
		]);
	});

	it('uses support route breadcrumbs for Settings routes outside primary navigation', () => {
		const nav = getOrgNavigation('org-1', baseCapabilities);

		expect(getOrgBreadcrumbs('/org/org-1/settings', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Settings' }
		]);
	});
});
