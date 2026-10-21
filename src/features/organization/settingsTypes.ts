import type { FeatureKey } from '$lib/access/featureSwitches';
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
	strengthFloorPercent: number;
}

export interface OrganizationFeatureSettings {
	disabledFeatures: FeatureKey[];
	strengthFloorPercent: number;
	/** The stored array as read, which a switch write must still find to apply. */
	storedDisabledFeatures: readonly string[];
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
	disabledFeatures?: FeatureKey[];
	strengthFloorPercent?: number;
}

export interface OrganizationPolicyWritePort {
	/** The values an audited switch or floor change replaces. */
	findFeatureSettings(orgId: string): Promise<OrganizationFeatureSettings | null>;
	/**
	 * With `ifDisabledFeatures`, the write applies only while the stored switches still equal it,
	 * and answers `stale` when another write changed them first.
	 */
	updatePolicies(
		orgId: string,
		changes: OrganizationPolicyChanges,
		ifDisabledFeatures?: readonly string[]
	): Promise<PolicyWriteResult>;
}

export type PolicyWriteResult = { status: 'saved' } | { status: 'stale' } | { status: 'failed'; message: string };

export interface OrganizationSettingsInput {
	archiveRetentionMonths?: number;
	lossWarningWindowDays?: number;
	trainingReadinessGoalPercent?: number;
	personnelDocumentStorageCapMb?: number;
	featureSwitch?: FeatureSwitchChange;
	strengthFloorPercent?: number;
}

/** Turns one feature on or off for the unit and leaves the other switches as stored. */
export interface FeatureSwitchChange {
	feature: FeatureKey;
	on: boolean;
}

export interface OrganizationRetentionConfiguration {
	id: string;
	retentionMonths?: number | null;
}

/** Separate maintenance authority; ordinary settings readers cannot enumerate Organizations. */
export interface OrganizationRetentionSettingsReader {
	listConfigurations(): Promise<OrganizationRetentionConfiguration[]>;
}
