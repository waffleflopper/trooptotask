import type { AccessRequestSetupState } from '$features/identity/contracts';

/** Complete only after the provider call and attachment or byte cleanup are acknowledged. */
export interface OrganizationFileUploadRegistration {
	complete(): Promise<void>;
}

/** Derived account setup state for this Organization's own invitations. */
export interface OrganizationInvitationSetupStateLookupPort {
	findSetupStateByInvitationId(orgId: string, invitationIds: string[]): Promise<Map<string, AccessRequestSetupState>>;
}

export type {
	SettingsMemberRow,
	SettingsMembersSectionData,
	SettingsInvitationFunnelStatus
} from './memberSettingsTypes';
export type { SettingsMemberAccessRow } from './settingsMemberAccessModel';

export type { DangerSettingsData, SettingsDangerSectionData } from './dangerSettingsTypes';

export { getPreferredOrganizationUrlSegment, normalizeOrganizationUrlSlug, validateOrganizationUrlSlug } from './url';
export type { OrganizationRouteIdentity, OrganizationMembershipSummary } from './profileTypes';
export type {
	GeneralSettingsData,
	GeneralSettingsOrganizationSource,
	SettingsOrganizationSectionData,
	GeneralSettingsActionData
} from './generalSettingsTypes';
export { buildGeneralSettingsData } from './generalSettings';
