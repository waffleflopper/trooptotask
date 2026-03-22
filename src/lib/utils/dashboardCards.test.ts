import { describe, it, expect } from 'vitest';
import { getVisibleDashboardCards } from './dashboardCards';
import type { OrganizationMemberPermissions } from '$lib/types';

function makePermissions(overrides: Partial<OrganizationMemberPermissions> = {}): OrganizationMemberPermissions {
	return {
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
		canManageMembers: false,
		...overrides
	};
}

describe('getVisibleDashboardCards', () => {
	it('returns only calendar cards when user has only canViewCalendar', () => {
		const result = getVisibleDashboardCards(makePermissions({ canViewCalendar: true }));

		expect(result).toContain('strength');
		expect(result).toContain('duty');
		expect(result).toContain('upcoming');
		expect(result).toContain('groups');
		expect(result).not.toContain('training');
		expect(result).not.toContain('ratings');
		expect(result).not.toContain('onboardings');
	});

	it('returns training card when user has canViewTraining', () => {
		const result = getVisibleDashboardCards(makePermissions({ canViewTraining: true }));

		expect(result).toContain('training');
		expect(result).not.toContain('strength');
	});

	it('returns ratings card when user has canViewLeadersBook', () => {
		const result = getVisibleDashboardCards(makePermissions({ canViewLeadersBook: true }));

		expect(result).toContain('ratings');
		expect(result).not.toContain('training');
	});

	it('returns onboardings card when user has canViewPersonnel', () => {
		const result = getVisibleDashboardCards(makePermissions({ canViewPersonnel: true }));

		expect(result).toContain('onboardings');
		expect(result).not.toContain('strength');
	});

	it('returns all cards when all permissions are true', () => {
		const allTrue = makePermissions({
			canViewCalendar: true,
			canViewPersonnel: true,
			canViewTraining: true,
			canViewLeadersBook: true
		});

		const result = getVisibleDashboardCards(allTrue);

		expect(result).toEqual(['strength', 'duty', 'training', 'upcoming', 'ratings', 'onboardings', 'groups']);
	});

	it('returns empty array when no canView flags are true', () => {
		const result = getVisibleDashboardCards(makePermissions());

		expect(result).toEqual([]);
	});
});
