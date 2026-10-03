export interface OrganizationPolicySettings {
	archiveRetentionMonths?: number | null;
	lossWarningWindowDays?: number | null;
}

/** Organization-owned facts; construction never reads the provider. */
export interface OrganizationSettingsReader {
	findPolicies(orgId: string): Promise<OrganizationPolicySettings | null>;
	findArchiveRetentionMonths(orgId: string): Promise<number | null | undefined>;
	findLossWarningWindowDays(orgId: string): Promise<number | null | undefined>;
	findStorageCapBytes(orgId: string): Promise<number | null | undefined>;
	countPendingInvitations(orgId: string): Promise<number>;
}

export interface OrganizationPolicyChanges {
	archiveRetentionMonths?: number;
	lossWarningWindowDays?: number;
	personnelDocumentStorageCapBytes?: number;
}

export interface OrganizationPolicyWritePort {
	/** Null means the canonical Organization and every submitted value were acknowledged. */
	updatePolicies(orgId: string, changes: OrganizationPolicyChanges): Promise<string | null>;
}

export interface OrganizationSettingsInput {
	archiveRetentionMonths?: number;
	lossWarningWindowDays?: number;
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
