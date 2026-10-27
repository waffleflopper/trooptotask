export type {
	OrganizationCriticalTasksDefaults,
	OrganizationSettingsMembershipRow,
	OrganizationSettingsInvitationRow,
	OrganizationSettingsInvitationDeliveryRow,
	OrganizationOwnershipCandidateMembershipRow
} from './organizationSettingsTypes';
import type { AccessRequestSetupState } from '$features/identity/contracts';
import type { OrganizationPlatformMembershipPort } from './platformMembershipTypes';

export type { OrganizationSupportMember, OrganizationTransferResult } from './platformMembershipTypes';
export type OrganizationSupportMemberReader = Pick<OrganizationPlatformMembershipPort, 'listMembers'>;

/** Complete only after the provider call and attachment or byte cleanup are acknowledged. */
export interface OrganizationFileUploadRegistration {
	complete(): Promise<void>;
}

/** A committed deletion's stored file is removed now, or later by scheduled cleanup. */
export type FileCleanup = 'complete' | 'pending';

export interface OrganizationInvitationSetupStateLookupPort {
	findSetupStateByInvitationId(orgId: string, invitationIds: string[]): Promise<Map<string, AccessRequestSetupState>>;
}

export type {
	SettingsInvitationHistoryRow,
	SettingsMemberRow,
	SettingsPendingInvitationRow
} from './memberSettingsTypes';

export { DESTRUCTION_COUNT_KEYS, type DangerSettingsData, type DestructionCounts } from './dangerSettingsTypes';

export { getPreferredOrganizationUrlSegment, normalizeOrganizationUrlSlug, validateOrganizationUrlSlug } from './url';
export type { OrganizationRouteIdentity, OrganizationMembershipSummary } from './profileTypes';
export type {
	CalendarCounts,
	GeneralSettingsActionData,
	GeneralSettingsData,
	GeneralSettingsOrganization,
	LastRenamed
} from './generalSettingsTypes';
export { CALENDAR_COUNT_KEYS } from './generalSettingsTypes';

export type {
	OrganizationSettingsReader,
	OrganizationPolicySettings,
	OrganizationFeatureSettings,
	OrganizationPolicyChanges,
	OrganizationPolicyWritePort,
	OrganizationSettingsInput,
	OrganizationRetentionConfiguration,
	OrganizationRetentionSettingsReader
} from './settingsTypes';
export { isOrganizationRawExportTable } from './rawExportTypes';
export type { OrganizationRawExportTable, OrganizationRawExportReader } from './rawExportTypes';
export type { UnitCountKey, UnitCounts } from './unitCounts';
export {
	DEFAULT_ARCHIVE_RETENTION_MONTHS,
	DEFAULT_LOSS_WARNING_WINDOW_DAYS,
	DEFAULT_STRENGTH_FLOOR_PERCENT,
	DEFAULT_TRAINING_READINESS_GOAL_PERCENT,
	ARCHIVE_RETENTION_CONSTRAINT,
	LOSS_WARNING_CONSTRAINT,
	TRAINING_READINESS_GOAL_CONSTRAINT,
	readLossWarningWindowDays
} from './policyConstraints';

export { buildSettingsShell, SETTINGS_PAGES } from './settingsShell';
export type { SettingsNavCounts, SettingsShell, SettingsShellOrganizationSource } from './settingsShell';
export type {
	OrganizationSupportOrganization,
	OrganizationSupportUserMembership,
	OrganizationSupportReader,
	CurrentOrganizationSuspension,
	OrganizationSupportSuspensionCommands
} from './supportReadTypes';
export type {
	OrganizationPlatformInvitationReader,
	OrganizationSupportInvitationOriginFact
} from './invitationSupportTypes';
export {
	FEATURE_COUNT_KEYS,
	FEATURE_ROWS,
	availabilityHolds,
	holdsLane,
	lossWindowHolds,
	strengthFloorSentence,
	type FeatureCounts,
	type FeatureRow,
	type FeaturesSettingsData,
	type HoldsLane
} from './featuresSettings';
export { availabilityPercent, isBelowStrengthFloor } from './strengthFloor';

export * from './setup/registry';
export * from './setup/state';
export * from './setup/model';
export * from './setup/hasData';
