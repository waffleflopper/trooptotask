import type { MembershipRole } from '$lib/access/memberAccessShape';

export interface GeneralSettingsOrganizationSource {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
}

export interface SettingsOrganizationSectionData extends GeneralSettingsOrganizationSource {
	canUpdateProfile: boolean;
	canUpdateUrlSlug: boolean;
}

export interface GeneralSettingsData {
	currentMember: { role: MembershipRole; isOwner: boolean; isAdmin: boolean; canManageMembers: boolean };
	sections: { organization: SettingsOrganizationSectionData };
}

export type GeneralSettingsActionData = {
	[key: string]: unknown;
	nameSuccess?: boolean;
	error?: string;
	slugError?: string;
} | null;
