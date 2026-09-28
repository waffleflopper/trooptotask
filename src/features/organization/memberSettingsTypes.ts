import type { CapabilityLevel, DurableFeatureLane, ScopeSet } from '$lib/access/memberAccessShape';
import type { EditablePreset } from './settingsMemberAccessConstants';
import type { SettingsInvitationAccessRow, SettingsMemberAccessRow } from './settingsMemberAccessModel';

export type SettingsMemberRow = SettingsMemberAccessRow & {
	editor: {
		selectedPreset: EditablePreset;
		scopeKind: ScopeSet['kind'];
		scopeGroupIds: string[];
		availablePresetOptions: Array<{ value: EditablePreset; label: string; helper: string }>;
		availableGroups: Array<{ id: string; name: string }>;
	};
	accessBadge: 'owner' | 'admin' | 'viewer' | 'operator' | 'editor' | 'custom';
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
	accessBadge: 'admin' | 'viewer' | 'operator' | 'editor' | 'custom';
	scopeDisplayLabel: string;
	deliveryStatus: 'not_sent' | 'pending' | 'sent' | 'failed';
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
};

export type SettingsInvitationHistoryRow = SettingsInvitationRow & {
	lifecycleStatus: 'accepted' | 'declined' | 'revoked' | 'expired' | 'blocked' | 'closed';
	lifecycleStatusLabel: string;
	lifecycleDetail: string | null;
	lifecycleAt: string;
};

export type SettingsMembersSectionData = {
	rows: SettingsMemberRow[];
	invitations: SettingsPendingInvitationRow[];
	invitationHistory: SettingsInvitationHistoryRow[];
	groups: Array<{ id: string; name: string }>;
	roleCounts: Record<'owner' | 'admin' | 'member', number>;
	memberRoleSummary: string;
	pendingApprovalSummary: { count: number; oldestCreatedAt: string | null };
	availableAccessLanes: Array<{ id: DurableFeatureLane; label: string }>;
	capabilityOptions: Array<{ value: CapabilityLevel; label: string }>;
	canInvite: boolean;
	canManageMemberAccess: boolean;
};
