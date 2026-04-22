import { describe, expect, it } from 'vitest';
import type { OrganizationMemberPermissions } from '$lib/types';
import { getOrgNavigation, isOrgNavItemActive } from './orgNavigation';

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
});
