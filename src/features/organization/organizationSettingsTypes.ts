import type {
	CapabilityOverrideMap,
	MembershipRole,
	ScopeSet,
	StoredMemberPreset
} from '$lib/access/memberAccessShape';

export type SettingsAccessSourceRow = {
	id?: unknown;
	organization_id?: unknown;
	user_id?: unknown;
	email?: unknown;
	role?: unknown;
	member_preset?: StoredMemberPreset | null;
	capability_overrides?: CapabilityOverrideMap | null;
	access_scope_kind?: ScopeSet['kind'] | null;
	access_scope_group_ids?: string[] | null;
	status?: unknown;
	created_at?: unknown;
	expires_at?: unknown;
	accepted_at?: unknown;
	declined_at?: unknown;
	revoked_at?: unknown;
	expired_at?: unknown;
	blocked_at?: unknown;
};

export type OrganizationSettingsMembershipRow = Pick<
	SettingsAccessSourceRow,
	| 'id'
	| 'organization_id'
	| 'user_id'
	| 'email'
	| 'role'
	| 'created_at'
	| 'member_preset'
	| 'capability_overrides'
	| 'access_scope_kind'
	| 'access_scope_group_ids'
>;

export type OrganizationSettingsInvitationRow = Pick<
	SettingsAccessSourceRow,
	| 'id'
	| 'email'
	| 'role'
	| 'status'
	| 'created_at'
	| 'expires_at'
	| 'accepted_at'
	| 'declined_at'
	| 'revoked_at'
	| 'expired_at'
	| 'blocked_at'
	| 'member_preset'
	| 'capability_overrides'
	| 'access_scope_kind'
	| 'access_scope_group_ids'
>;

export interface OrganizationSettingsInvitationDeliveryRow {
	id: string;
	invitation_id: string;
	status: 'pending' | 'sent' | 'failed';
	attempt_count: number;
	last_error: string | null;
	updated_at: string;
	sent_at: string | null;
}

export interface OrganizationOwnershipCandidateMembershipRow {
	id: string;
	user_id: string | null;
	email: string | null;
	role: MembershipRole;
}

export interface OrganizationCriticalTasksDefaults {
	defaultExpirationMonths?: number | null;
	expiringSoonWarningDays?: number | null;
}
