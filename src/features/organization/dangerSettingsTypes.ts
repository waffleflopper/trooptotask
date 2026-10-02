import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { SettingsMemberRow } from './memberSettingsTypes';

export interface SettingsDangerSectionData {
	transferOwnershipCandidates: Array<Pick<SettingsMemberRow, 'id' | 'userId' | 'email' | 'membershipRole'>>;
	deleteConfirmation: { organizationName: string | null; normalizedOrganizationName: string };
	commands: { canTransferOwnership: boolean; canDeleteOrganization: boolean };
}
export interface DangerSettingsData {
	currentMember: { role: MembershipRole; isOwner: boolean; isAdmin: boolean; canManageMembers: boolean };
	sections: {
		organization: {
			id: string;
			name: string | null;
			urlSlug: string | null;
			urlSegment: string;
			canUpdateProfile: boolean;
			canUpdateUrlSlug: boolean;
		};
		dangerZone: SettingsDangerSectionData;
	};
}
