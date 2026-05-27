import type { CapabilityOverrideMap, StoredMemberPreset } from '$lib/access/memberAccessShape';

export interface OrganizationInvitationAccessShape {
	organizationId: string;
	role?: 'admin' | 'member' | null;
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
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: 'organization' | 'groups';
	accessScopeGroupIds: string[];
}

// Specification mirror for the SQL accept_organization_invitation transition.
// The production acceptance path is the database RPC; keep this shape aligned with the migration.
export function deriveMembershipFromInvitation(input: {
	invitation: OrganizationInvitationAccessShape;
	userId: string;
	email: string;
}): OrganizationMembershipDraft {
	const { invitation, userId, email } = input;
	const role = invitation.role === 'admin' ? 'admin' : 'member';

	return {
		organizationId: invitation.organizationId,
		userId,
		email,
		role,
		memberPreset: role === 'admin' ? 'editor' : (invitation.memberPreset ?? 'editor'),
		capabilityOverrides: role === 'admin' ? {} : (invitation.capabilityOverrides ?? {}),
		accessScopeKind: role === 'admin' ? 'organization' : (invitation.accessScopeKind ?? 'organization'),
		accessScopeGroupIds: role === 'admin' ? [] : (invitation.accessScopeGroupIds ?? [])
	};
}

export function isAdminInvitation(invitation: OrganizationInvitationAccessShape): boolean {
	return invitation.role === 'admin';
}
