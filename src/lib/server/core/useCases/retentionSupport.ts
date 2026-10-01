import type { ArchiveRetentionOrgConfig } from './archiveRetention';

export interface ArchiveRetentionSettingsRow {
	id: string;
	archive_retention_months: number | null;
}

export function mapArchiveRetentionOrgConfigs(orgs: ArchiveRetentionSettingsRow[]): ArchiveRetentionOrgConfig[] {
	return orgs.map((org) => ({
		id: org.id,
		retentionMonths: org.archive_retention_months
	}));
}
