import type { CapabilityMap, MembershipRole, MemberPreset, ScopeSet } from '$lib/access/memberAccessShape';
import type { OrganizationGovernancePolicyAction } from '$lib/access/policyEvaluator';

export type OrganizationGovernanceActionId = OrganizationGovernancePolicyAction['id'];

export interface SettingsAccessShape {
	memberPreset: MemberPreset;
	capabilityMap: CapabilityMap;
	scopeSet: ScopeSet;
	organizationGovernanceActions: OrganizationGovernanceActionId[];
}

export interface SettingsMemberAccessRow {
	id: string;
	organizationId: string;
	userId: string;
	email?: string;
	membershipRole: MembershipRole;
	createdAt: string;
	access: SettingsAccessShape;
}

export interface SettingsInvitationAccessRow {
	id: string;
	email: string;
	status: string;
	membershipRole: MembershipRole;
	createdAt: string;
	expiresAt?: string;
	acceptedAt?: string;
	declinedAt?: string;
	revokedAt?: string;
	expiredAt?: string;
	blockedAt?: string;
	access: SettingsAccessShape;
}
