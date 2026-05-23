import { projectEffectiveInvitationCompatibilityAccess } from '$lib/access/memberAccessProjection';
import type { CapabilityOverrideMap, StoredMemberPreset } from '$lib/access/memberAccessShape';

export interface OrganizationInvitationAccessShape {
	organizationId: string;
	role?: 'admin' | 'member' | null;
	canViewCalendar: boolean | null;
	canEditCalendar: boolean | null;
	canViewPersonnel: boolean | null;
	canEditPersonnel: boolean | null;
	canViewTraining: boolean | null;
	canEditTraining: boolean | null;
	canViewCriticalTasks: boolean | null;
	canEditCriticalTasks: boolean | null;
	canViewOnboarding: boolean | null;
	canEditOnboarding: boolean | null;
	canViewRatingScheme?: boolean | null;
	canEditRatingScheme?: boolean | null;
	canManageMembers: boolean | null;
	scopedGroupId?: string | null;
	memberPreset?: StoredMemberPreset | null;
	capabilityOverrides?: CapabilityOverrideMap | null;
	accessScopeKind?: 'organization' | 'groups' | null;
	accessScopeGroupIds?: string[] | null;
}

export interface OrganizationMembershipDraft {
	organizationId: string;
	userId: string;
	email: string;
	role: 'admin' | 'member';
	canViewCalendar: boolean;
	canEditCalendar: boolean;
	canViewPersonnel: boolean;
	canEditPersonnel: boolean;
	canViewTraining: boolean;
	canEditTraining: boolean;
	canViewCriticalTasks: boolean;
	canEditCriticalTasks: boolean;
	canViewOnboarding: boolean;
	canEditOnboarding: boolean;
	canViewRatingScheme: boolean;
	canEditRatingScheme: boolean;
	canManageMembers: boolean;
	scopedGroupId: string | null;
	memberPreset: StoredMemberPreset | null;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: 'organization' | 'groups' | null;
	accessScopeGroupIds: string[];
}

export function deriveMembershipFromInvitation(input: {
	invitation: OrganizationInvitationAccessShape;
	userId: string;
	email: string;
}): OrganizationMembershipDraft {
	const { invitation, userId, email } = input;
	const projection = projectEffectiveInvitationCompatibilityAccess(invitation);
	const permissions = projection.permissions;

	return {
		organizationId: invitation.organizationId,
		userId,
		email,
		role: projection.role === 'admin' ? 'admin' : 'member',
		canViewCalendar: permissions.canViewCalendar,
		canEditCalendar: permissions.canEditCalendar,
		canViewPersonnel: permissions.canViewPersonnel,
		canEditPersonnel: permissions.canEditPersonnel,
		canViewTraining: permissions.canViewTraining,
		canEditTraining: permissions.canEditTraining,
		canViewCriticalTasks: permissions.canViewCriticalTasks,
		canEditCriticalTasks: permissions.canEditCriticalTasks,
		canViewOnboarding: permissions.canViewOnboarding,
		canEditOnboarding: permissions.canEditOnboarding,
		canViewRatingScheme: permissions.canViewRatingScheme,
		canEditRatingScheme: permissions.canEditRatingScheme,
		canManageMembers: permissions.canManageMembers,
		scopedGroupId: invitation.scopedGroupId ?? null,
		memberPreset: invitation.memberPreset ?? null,
		capabilityOverrides: invitation.capabilityOverrides ?? {},
		accessScopeKind: invitation.accessScopeKind ?? null,
		accessScopeGroupIds: invitation.accessScopeGroupIds ?? []
	};
}

export function isAdminInvitation(invitation: OrganizationInvitationAccessShape): boolean {
	return projectEffectiveInvitationCompatibilityAccess(invitation).role === 'admin';
}
