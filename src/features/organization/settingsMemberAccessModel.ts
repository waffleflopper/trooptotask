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
	/** The levels on file. `access` projects Owners and Admins to Manage, but a save keeps these for lanes whose feature is off. */
	storedLevels: CapabilityMap;
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

/**
 * The expired history rows that may offer a new invitation: the newest row for its address, and only while no
 * invitation to that address is still waiting. `history` is newest first.
 */
export function reinvitableInvitationIds(
	history: readonly { id: string; email: string; lifecycleStatus: string }[],
	waitingEmails: readonly string[]
): string[] {
	const seen = new Set(waitingEmails.map((email) => email.toLowerCase()));
	return history.flatMap(({ id, email, lifecycleStatus }) => {
		const key = email.toLowerCase();
		if (seen.has(key)) return [];
		seen.add(key);
		return lifecycleStatus === 'expired' ? [id] : [];
	});
}
