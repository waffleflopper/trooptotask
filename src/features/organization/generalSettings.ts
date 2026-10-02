import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { GeneralSettingsData, GeneralSettingsOrganizationSource } from './generalSettingsTypes';

export function buildGeneralSettingsData(input: {
	currentMemberRole: MembershipRole;
	canManageMembers: boolean;
	isAdmin: boolean;
	organization: GeneralSettingsOrganizationSource;
}): GeneralSettingsData {
	return {
		currentMember: {
			role: input.currentMemberRole,
			isOwner: input.currentMemberRole === 'owner',
			isAdmin: input.isAdmin,
			canManageMembers: input.canManageMembers
		},
		sections: {
			organization: {
				...input.organization,
				canUpdateProfile: input.canManageMembers,
				canUpdateUrlSlug: input.canManageMembers
			}
		}
	};
}
