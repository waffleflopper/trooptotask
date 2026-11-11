import type { DurableFeatureLane, MembershipRole } from '$lib/access/memberAccessShape';
import type { InviteAddressResult } from './inviteAddresses';
import type { SettingsInvitationAccessRow, SettingsMemberAccessRow } from './settingsMemberAccessModel';

/** A Group a member's access can cover, with the active people filed directly in it. */
export interface ScopeGroup {
	id: string;
	name: string;
	parentId: string | null;
	memberCount: number;
}

/** The name a member shows under in this Organization, and where it came from. */
export interface SettingsMemberName {
	/** "SFC Ada Lovelace": rank first, then first and last name. */
	text: string;
	source: 'account' | 'organization';
	rank: string | null;
	firstName: string | null;
	lastName: string | null;
}

export type SettingsMemberRow = SettingsMemberAccessRow & {
	/** Null when neither the member's account nor an owner or admin has named them; the email stands in. */
	name: SettingsMemberName | null;
	scopeDisplayLabel: string;
	overriddenCapabilityLabels: string[];
};

/** Invitation email, account setup email, and invitee acceptance are distinct stages. */
export type SettingsInvitationFunnelStatus =
	| 'invitation_email_failed'
	| 'setup_email_failed'
	| 'waiting_on_them'
	| 'waiting_on_them_to_accept';

export type SettingsInvitationRow = SettingsInvitationAccessRow & {
	scopeDisplayLabel: string;
	deliveryStatus: 'not_sent' | 'pending' | 'sent' | 'failed' | 'sent_recording_failed';
	deliveryStatusLabel: string;
	deliveryAttemptCount: number;
	deliveryLastError: string | null;
	deliveryUpdatedAt: string | null;
	deliverySentAt: string | null;
	canResend: boolean;
};

export type SettingsPendingInvitationRow = SettingsInvitationRow & {
	funnelStatus: SettingsInvitationFunnelStatus;
	funnelStatusLabel: string;
	funnelStatusDetail: string;
	expiringSoon: boolean;
};

export type SettingsInvitationHistoryRow = SettingsInvitationAccessRow & {
	lifecycleStatus: 'accepted' | 'declined' | 'revoked' | 'expired' | 'blocked' | 'closed';
	lifecycleStatusLabel: string;
	lifecycleAt: string;
};

export type SettingsMembersSectionData = {
	rows: SettingsMemberRow[];
	invitations: SettingsPendingInvitationRow[];
	/** Streams after first paint; closed invitations sit behind a collapsed row. */
	invitationHistory: Promise<SettingsInvitationHistoryRow[]>;
	groups: ScopeGroup[];
	/** Lanes whose feature the unit turned off. Members keep their stored level in these lanes. */
	offLanes: DurableFeatureLane[];
	canInvite: boolean;
	canManageMemberAccess: boolean;
};

export interface MembersSettingsData {
	currentMember: {
		role: MembershipRole;
		isOwner: boolean;
		isAdmin: boolean;
		canManageMembers: boolean;
	};
	sections: {
		members: SettingsMembersSectionData;
	};
}

/** What a Members action returns; each key belongs to the control that sent the request. */
export type MembersSettingsActionData = {
	[key: string]: unknown;
	inviteError?: string;
	inviteSuccess?: boolean;
	inviteMessage?: string;
	inviteResults?: InviteAddressResult[];
	memberError?: string;
	accessError?: string;
	accessSuccess?: boolean;
	nameError?: string;
	nameSuccess?: boolean;
	nameMembershipId?: string;
} | null;
