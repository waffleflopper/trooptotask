import type { SettingsPendingInvitationRow } from '../memberSettingsTypes';

/** What the Invite your team step streams in: the form's groups and the invitations still pending. */
export interface SetupTeamData {
	canInvite: boolean;
	isOwner: boolean;
	groups: Array<{ id: string; name: string }>;
	invitations: SettingsPendingInvitationRow[];
}
