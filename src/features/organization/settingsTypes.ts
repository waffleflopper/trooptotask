import type {
	OrganizationCriticalTasksDefaults,
	OrganizationSettingsMembershipRow,
	OrganizationSettingsInvitationRow,
	OrganizationSettingsInvitationDeliveryRow,
	OrganizationOwnershipCandidateMembershipRow
} from './organizationSettingsTypes';

export interface OrganizationPolicySettings {
	archiveRetentionMonths?: number | null;
	lossWarningWindowDays?: number | null;
	trainingReadinessGoalPercent: number;
}

/** The Organization facts a Training briefing states: its name and readiness goal. */
export interface OrganizationTrainingBriefingContext {
	name: string;
	trainingReadinessGoalPercent: number;
}

/** Organization-owned facts; construction never reads the provider. */
export interface OrganizationSettingsReader {
	findCriticalTasksDefaults(orgId: string): Promise<OrganizationCriticalTasksDefaults | null>;
	listMemberAccess(orgId: string): Promise<OrganizationSettingsMembershipRow[]>;
	listInvitations(orgId: string): Promise<OrganizationSettingsInvitationRow[]>;
	listInvitationDeliveries(orgId: string): Promise<OrganizationSettingsInvitationDeliveryRow[]>;
	listOwnershipCandidateMemberships(orgId: string): Promise<OrganizationOwnershipCandidateMembershipRow[]>;
	findMemberLabels(orgId: string, userIds: string[]): Promise<Map<string, string>>;
	findPolicies(orgId: string): Promise<OrganizationPolicySettings | null>;
	findTrainingBriefingContext(orgId: string): Promise<OrganizationTrainingBriefingContext | null>;
	findArchiveRetentionMonths(orgId: string): Promise<number | null | undefined>;
	findLossWarningWindowDays(orgId: string): Promise<number | null | undefined>;
	findStorageCapBytes(orgId: string): Promise<number | null | undefined>;
	countPendingInvitations(orgId: string): Promise<number>;
}

export interface OrganizationPolicyChanges {
	archiveRetentionMonths?: number;
	lossWarningWindowDays?: number;
	trainingReadinessGoalPercent?: number;
	personnelDocumentStorageCapBytes?: number;
}

export interface OrganizationPolicyWritePort {
	/** Null means the canonical Organization and every submitted value were acknowledged. */
	updatePolicies(orgId: string, changes: OrganizationPolicyChanges): Promise<string | null>;
}

export interface OrganizationSettingsInput {
	archiveRetentionMonths?: number;
	lossWarningWindowDays?: number;
	trainingReadinessGoalPercent?: number;
	personnelDocumentStorageCapMb?: number;
}

export interface OrganizationRetentionConfiguration {
	id: string;
	retentionMonths?: number | null;
}

/** Separate maintenance authority; ordinary settings readers cannot enumerate Organizations. */
export interface OrganizationRetentionSettingsReader {
	listConfigurations(): Promise<OrganizationRetentionConfiguration[]>;
}
