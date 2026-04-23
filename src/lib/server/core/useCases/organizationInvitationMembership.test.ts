import { describe, expect, it } from 'vitest';
import { deriveMembershipFromInvitation, isAdminInvitation } from './organizationInvitationMembership';

describe('organizationInvitationMembership', () => {
	it('derives an admin membership only when every permission and manage-members is granted', () => {
		const invitation = {
			organizationId: 'org-1',
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true,
			scopedGroupId: null
		};

		expect(isAdminInvitation(invitation)).toBe(true);
		expect(
			deriveMembershipFromInvitation({
				invitation,
				userId: 'user-1',
				email: 'user@example.com'
			})
		).toMatchObject({
			role: 'admin'
		});
	});

	it('defaults nullable invitation flags to the current full-view/full-edit compatibility behavior', () => {
		const membership = deriveMembershipFromInvitation({
			invitation: {
				organizationId: 'org-1',
				canViewCalendar: null,
				canEditCalendar: null,
				canViewPersonnel: null,
				canEditPersonnel: null,
				canViewTraining: null,
				canEditTraining: null,
				canViewCriticalTasks: null,
				canEditCriticalTasks: null,
				canViewOnboarding: null,
				canEditOnboarding: null,
				canViewLeadersBook: null,
				canEditLeadersBook: null,
				canManageMembers: null,
				scopedGroupId: 'group-1'
			},
			userId: 'user-1',
			email: 'user@example.com'
		});

		expect(membership).toEqual({
			organizationId: 'org-1',
			userId: 'user-1',
			email: 'user@example.com',
			role: 'member',
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewRatingScheme: true,
			canEditRatingScheme: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: false,
			scopedGroupId: 'group-1'
		});
	});

	it('keeps partially granted invitations in the member role when manage-members is missing', () => {
		const invitation = {
			organizationId: 'org-1',
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: false,
			scopedGroupId: null
		};

		expect(isAdminInvitation(invitation)).toBe(false);
		expect(
			deriveMembershipFromInvitation({
				invitation,
				userId: 'user-1',
				email: 'user@example.com'
			})
		).toMatchObject({
			role: 'member'
		});
	});
});
