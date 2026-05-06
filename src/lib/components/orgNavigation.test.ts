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
		expect(nav.find((item) => item.id === 'duty-rosters')?.visible).toBe(false);
		expect(nav.find((item) => item.id === 'personnel')?.visible).toBe(false);
		expect(nav.find((item) => item.id === 'training')?.visible).toBe(true);
		expect(nav.find((item) => item.id === 'critical-tasks')?.visible).toBe(true);
		expect(nav.find((item) => item.id === 'onboarding')?.visible).toBe(false);
		expect(nav.find((item) => item.id === 'rating-scheme')?.visible).toBe(true);
	});

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

	it('keeps replacement Duty Rosters out of primary navigation', () => {
		const withCalendar = getOrgNavigation('org-1', {
			...basePermissions,
			canViewCalendar: true
		});
		const withoutCalendar = getOrgNavigation('org-1', basePermissions);

		expect(withCalendar).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'duty-rosters',
					href: '/org/org-1/duty-rosters',
					label: 'Duty Rosters',
					compactLabel: 'Duty',
					visible: false
				})
			])
		);
		expect(withoutCalendar.find((item) => item.id === 'duty-rosters')?.visible).toBe(false);
	});

	it('treats replacement Duty Rosters child routes as active for the nav item', () => {
		const item = getOrgNavigation('org-1', {
			...basePermissions,
			canViewCalendar: true
		}).find((navItem) => navItem.id === 'duty-rosters');

		if (!item) {
			throw new Error('Duty Rosters nav item missing');
		}

		expect(isOrgNavItemActive('/org/org-1/duty-rosters/cq-nco/history', item)).toBe(true);
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
	});

	it('uses first-class Duty Rosters breadcrumbs for the replacement route', () => {
		const nav = getOrgNavigation('org-1', {
			...basePermissions,
			canViewCalendar: true
		});

		expect(getOrgBreadcrumbs('/org/org-1/duty-rosters', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Duty Rosters' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/duty-rosters/cq-nco/generate', 'Test Org', nav, 'CQ NCO')).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Duty Rosters', href: '/org/org-1/duty-rosters' },
			{ label: 'CQ NCO' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/duty-rosters/cq-nco/history', 'Test Org', nav, 'CQ NCO')).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Duty Rosters', href: '/org/org-1/duty-rosters' },
			{ label: 'CQ NCO' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/duty-rosters/cq-nco/settings', 'Test Org', nav, 'CQ NCO')).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Duty Rosters', href: '/org/org-1/duty-rosters' },
			{ label: 'CQ NCO' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/duty-rosters/new', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Duty Rosters', href: '/org/org-1/duty-rosters' },
			{ label: 'New Template' }
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

	it('includes linked Training subroute breadcrumbs', () => {
		const nav = getOrgNavigation('org-1', {
			...basePermissions,
			canViewTraining: true
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
			...basePermissions,
			canViewCriticalTasks: true
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
			...basePermissions,
			canViewCriticalTasks: true
		});

		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/person-1', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'Person' }
		]);
	});

	it('uses a route-provided personnel label for Critical Tasks person records', () => {
		const nav = getOrgNavigation('org-1', {
			...basePermissions,
			canViewCriticalTasks: true
		});

		expect(getOrgBreadcrumbs('/org/org-1/critical-tasks/person-1', 'Test Org', nav, 'CPT Hayes, Emma')).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Critical Tasks', href: '/org/org-1/critical-tasks' },
			{ label: 'CPT Hayes, Emma' }
		]);
	});

	it('uses support route breadcrumbs for Settings routes outside primary navigation', () => {
		const nav = getOrgNavigation('org-1', basePermissions);

		expect(getOrgBreadcrumbs('/org/org-1/settings', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Settings' }
		]);
	});

	it('uses linked Settings breadcrumbs for organization governance subroutes outside primary navigation', () => {
		const nav = getOrgNavigation('org-1', basePermissions);

		expect(getOrgBreadcrumbs('/org/org-1/settings/audit', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Settings', href: '/org/org-1/settings' },
			{ label: 'Audit' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/settings/approvals', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Settings', href: '/org/org-1/settings' },
			{ label: 'Approvals' }
		]);
	});

	it('uses linked Billing breadcrumbs for billing result routes outside primary navigation', () => {
		const nav = getOrgNavigation('org-1', basePermissions);

		expect(getOrgBreadcrumbs('/org/org-1/billing/success', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Billing', href: '/org/org-1/billing' },
			{ label: 'Success' }
		]);
		expect(getOrgBreadcrumbs('/org/org-1/billing/canceled', 'Test Org', nav)).toEqual([
			{ label: 'Test Org', href: '/org/org-1' },
			{ label: 'Billing', href: '/org/org-1/billing' },
			{ label: 'Canceled' }
		]);
	});
});
