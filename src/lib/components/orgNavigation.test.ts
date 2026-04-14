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
	canViewOnboarding: false,
	canEditOnboarding: false,
	canViewLeadersBook: false,
	canEditLeadersBook: false,
	canManageMembers: false
};

describe('getOrgNavigation', () => {
	it('shows Critical Tasks for training viewers and hides it without training view access', () => {
		const withTraining = getOrgNavigation('org-1', {
			...basePermissions,
			canViewTraining: true
		});
		const withoutTraining = getOrgNavigation('org-1', basePermissions);

		expect(withTraining).toEqual(
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
		expect(withoutTraining.find((item) => item.id === 'critical-tasks')?.visible).toBe(false);
	});

	it('treats Critical Tasks child routes as active for the nav item', () => {
		const item = getOrgNavigation('org-1', {
			...basePermissions,
			canViewTraining: true
		}).find((navItem) => navItem.id === 'critical-tasks');

		if (!item) {
			throw new Error('Critical Tasks nav item missing');
		}

		expect(isOrgNavItemActive('/org/org-1/critical-tasks/reports', item)).toBe(true);
	});
});
