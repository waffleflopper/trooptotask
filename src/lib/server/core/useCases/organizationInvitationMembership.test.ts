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
			canManageMembers: true
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

	it('defaults nullable invitation flags to the shared full-view/full-edit compatibility behavior', () => {
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
			canManageMembers: false,
			scopedGroupId: 'group-1',
			memberPreset: null,
			capabilityOverrides: {},
			accessScopeKind: null,
			accessScopeGroupIds: []
		});
	});

	it('derives admin invitation membership through the shared invitation projection', () => {
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
			canViewRatingScheme: true,
			canEditRatingScheme: true,
			canManageMembers: true,
			memberPreset: 'viewer' as const,
			capabilityOverrides: { calendar: 'none' as const },
			accessScopeKind: 'groups' as const,
			accessScopeGroupIds: ['group-alpha']
		};

		expect(isAdminInvitation(invitation)).toBe(true);
		expect(
			deriveMembershipFromInvitation({
				invitation,
				userId: 'user-1',
				email: 'user@example.com'
			})
		).toMatchObject({
			role: 'admin',
			canManageMembers: true,
			memberPreset: 'viewer',
			capabilityOverrides: { calendar: 'none' },
			accessScopeKind: 'groups',
			accessScopeGroupIds: ['group-alpha']
		});
	});

	it('carries stored member access from invitation to membership without recomputing preset lineage', () => {
		const membership = deriveMembershipFromInvitation({
			invitation: {
				organizationId: 'org-1',
				canViewCalendar: true,
				canEditCalendar: false,
				canViewPersonnel: true,
				canEditPersonnel: false,
				canViewTraining: true,
				canEditTraining: false,
				canViewCriticalTasks: true,
				canEditCriticalTasks: false,
				canViewOnboarding: true,
				canEditOnboarding: false,
				canManageMembers: false,
				memberPreset: 'viewer',
				capabilityOverrides: { calendar: 'operate' },
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['group-alpha', 'group-bravo']
			},
			userId: 'user-1',
			email: 'user@example.com'
		});

		expect(membership).toMatchObject({
			memberPreset: 'viewer',
			capabilityOverrides: { calendar: 'operate' },
			accessScopeKind: 'groups',
			accessScopeGroupIds: ['group-alpha', 'group-bravo']
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
			canManageMembers: false
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
