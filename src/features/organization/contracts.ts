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

export type {
	OrganizationSettingsReader,
	OrganizationPolicySettings,
	OrganizationPolicyChanges,
	OrganizationPolicyWritePort,
	OrganizationSettingsInput,
	OrganizationRetentionConfiguration,
	OrganizationRetentionSettingsReader
} from './settingsTypes';
export { isOrganizationRawExportTable } from './rawExportTypes';
export type { OrganizationRawExportTable, OrganizationRawExportReader } from './rawExportTypes';
export type { PoliciesSettingsData, SettingsPoliciesSectionData } from './policiesSettingsTypes';
export { DEFAULT_ARCHIVE_RETENTION_MONTHS, DEFAULT_LOSS_WARNING_WINDOW_DAYS } from './policyConstraints';

export { buildSettingsShell } from './settingsShell';
export type { SettingsShell, SettingsShellOrganizationSource } from './settingsShell';
