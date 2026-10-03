/** Exact Organization invitation provenance consumed by privileged Access Request review. */
export interface OrganizationSupportInvitationOriginFact {
	id: string;
	organization_invitation_id: string;
	organization_id: string;
	invited_by: string;
	invited_at: string;
	intended_membership_role: string;
	intended_member_preset: string | null;
	organizations: { id: string; name: string | null } | null;
}

export interface OrganizationPlatformInvitationReader {
	listInvitationOrigins(accessRequestIds: string[]): Promise<Map<string, OrganizationSupportInvitationOriginFact[]>>;
}
