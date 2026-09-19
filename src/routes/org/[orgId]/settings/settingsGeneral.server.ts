import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { SettingsOrganizationSectionData } from './settingsSectionTypes';

export interface GeneralSettingsOrganizationSource {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
}

export interface GeneralSettingsData {
	currentMember: {
		role: MembershipRole;
		isOwner: boolean;
		isAdmin: boolean;
		canManageMembers: boolean;
	};
	sections: {
		organization: SettingsOrganizationSectionData;
	};
}

export function buildGeneralSettingsData(
	ctx: Pick<UseCaseContext, 'auth'>,
	input: { isAdmin: boolean; organization: GeneralSettingsOrganizationSource }
): GeneralSettingsData {
	const isOwner = ctx.auth.role === 'owner';
	const canManageMembers = ctx.auth.canManageMembers;

	return {
		currentMember: {
			role: ctx.auth.role,
			isOwner,
			isAdmin: input.isAdmin,
			canManageMembers
		},
		sections: {
			organization: {
				id: input.organization.id,
				name: input.organization.name,
				urlSlug: input.organization.urlSlug,
				urlSegment: input.organization.urlSegment,
				canUpdateProfile: canManageMembers,
				canUpdateUrlSlug: canManageMembers
			}
		}
	};
}
