import type { CapabilityOverrideMap, StoredMemberPreset } from '$lib/access/memberAccessShape';

export interface OrganizationInvitationAccessShape {
	organizationId: string;
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
	canViewLeadersBook: boolean | null;
	canEditLeadersBook: boolean | null;
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
	canViewLeadersBook: boolean;
	canEditLeadersBook: boolean;
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
	const canViewRatingScheme = invitation.canViewRatingScheme ?? invitation.canViewPersonnel ?? true;
	const canEditRatingScheme =
		invitation.canEditRatingScheme ??
		((invitation.canEditPersonnel ?? true) && (invitation.canEditLeadersBook ?? true));

	return {
		organizationId: invitation.organizationId,
		userId,
		email,
		role: isAdminInvitation(invitation) ? 'admin' : 'member',
		canViewCalendar: invitation.canViewCalendar ?? true,
		canEditCalendar: invitation.canEditCalendar ?? true,
		canViewPersonnel: invitation.canViewPersonnel ?? true,
		canEditPersonnel: invitation.canEditPersonnel ?? true,
		canViewTraining: invitation.canViewTraining ?? true,
		canEditTraining: invitation.canEditTraining ?? true,
		canViewCriticalTasks: invitation.canViewCriticalTasks ?? true,
		canEditCriticalTasks: invitation.canEditCriticalTasks ?? true,
		canViewOnboarding: invitation.canViewOnboarding ?? true,
		canEditOnboarding: invitation.canEditOnboarding ?? true,
		canViewRatingScheme,
		canEditRatingScheme,
		canViewLeadersBook: invitation.canViewLeadersBook ?? true,
		canEditLeadersBook: invitation.canEditLeadersBook ?? true,
		canManageMembers: invitation.canManageMembers ?? false,
		scopedGroupId: invitation.scopedGroupId ?? null,
		memberPreset: invitation.memberPreset ?? null,
		capabilityOverrides: invitation.capabilityOverrides ?? {},
		accessScopeKind: invitation.accessScopeKind ?? null,
		accessScopeGroupIds: invitation.accessScopeGroupIds ?? []
	};
}

export function isAdminInvitation(invitation: OrganizationInvitationAccessShape): boolean {
	const canViewRatingScheme = invitation.canViewRatingScheme ?? invitation.canViewPersonnel ?? true;
	const canEditRatingScheme =
		invitation.canEditRatingScheme ??
		((invitation.canEditPersonnel ?? true) && (invitation.canEditLeadersBook ?? true));

	return (
		!!invitation.canViewCalendar &&
		!!invitation.canEditCalendar &&
		!!invitation.canViewPersonnel &&
		!!invitation.canEditPersonnel &&
		!!invitation.canViewTraining &&
		!!invitation.canEditTraining &&
		!!invitation.canViewCriticalTasks &&
		!!invitation.canEditCriticalTasks &&
		!!invitation.canViewOnboarding &&
		!!invitation.canEditOnboarding &&
		!!canViewRatingScheme &&
		!!canEditRatingScheme &&
		!!invitation.canViewLeadersBook &&
		!!invitation.canEditLeadersBook &&
		!!invitation.canManageMembers
	);
}
