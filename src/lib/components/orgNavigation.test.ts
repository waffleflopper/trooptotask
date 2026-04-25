import { describe, expect, it } from 'vitest';
import type { OrganizationMemberPermissions } from '$lib/types';
import { getOrgBreadcrumbs, getOrgNavigation, isOrgNavItemActive } from './orgNavigation';

const basePermissions: OrganizationMemberPermissions = {
	canViewCalendar: false,
	canEditCalendar: false,
	canViewPersonnel: false,
	canEditPersonnel: false,
	canViewTraining: false,
	canEditTraining: false,
	canViewCriticalTasks: false,
	canEditCriticalTasks: false,
	canViewOnboarding: false,
	canEditOnboarding: false,
	canViewRatingScheme: false,
	canEditRatingScheme: false,
	canViewLeadersBook: false,
	canEditLeadersBook: false,
	canManageMembers: false
};

describe('getOrgNavigation', () => {
	it('shows Critical Tasks for critical tasks viewers and hides it without critical tasks view access', () => {
		const withCriticalTasks = getOrgNavigation('org-1', {
			...basePermissions,
			canViewCriticalTasks: true
		});
		const withoutCriticalTasks = getOrgNavigation('org-1', basePermissions);

		expect(withCriticalTasks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'critical-tasks',
					href: '/org/org-1/critical-tasks',
					label: 'Critical Tasks',
					compactLabel: 'ICTLs',
					badgeLabel: 'Beta',
					visible: true
				})
			])
		);
		expect(withoutCriticalTasks.find((item) => item.id === 'critical-tasks')?.visible).toBe(false);
	});

	it('treats Critical Tasks child routes as active for the nav item', () => {
		const item = getOrgNavigation('org-1', {
			...basePermissions,
			canViewCriticalTasks: true
		}).find((navItem) => navItem.id === 'critical-tasks');

		if (!item) {
			throw new Error('Critical Tasks nav item missing');
		}

		expect(isOrgNavItemActive('/org/org-1/critical-tasks/reports', item)).toBe(true);
	});

	it('shows an Evals nav item when the member can view rating scheme', () => {
		const nav = getOrgNavigation('org-1', {
			...basePermissions,
			canViewPersonnel: true,
			canViewRatingScheme: true
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
			...basePermissions,
			canViewRatingScheme: true
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
			...basePermissions,
			canViewCalendar: true
		});

		expect(getOrgBreadcrumbs('/org/org-1/calendar/settings', 'Test Org', nav).map((crumb) => crumb.label)).toEqual([
			'Test Org',
			'Calendar',
			'Settings'
		]);
		expect(getOrgBreadcrumbs('/org/org-1/calendar/duty-roster', 'Test Org', nav).map((crumb) => crumb.label)).toEqual([
			'Test Org',
			'Calendar',
			'Duty Roster'
		]);
	});

	it('links parent breadcrumbs for Calendar subroutes', () => {
		const nav = getOrgNavigation('org-1', {
			...basePermissions,
			canViewCalendar: true
		});

		expect(getOrgBreadcrumbs('/org/org-1/calendar/settings', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Calendar', href: '/org/org-1/calendar' },
			{ label: 'Settings' }
		]);
	});

	it('includes linked Onboarding subroute breadcrumbs', () => {
		const nav = getOrgNavigation('org-1', {
			...basePermissions,
			canViewOnboarding: true
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
});
