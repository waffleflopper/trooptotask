import type { UnitCounts } from '$features/organization/contracts';

export type OrganizationExportFormat = 'json' | 'excel';

export const EXPORT_SCOPE_COUNT_KEYS = ['activePersonnel', 'trainingRecords'] as const;

export type ExportScopeCounts = UnitCounts<(typeof EXPORT_SCOPE_COUNT_KEYS)[number]>;

export interface LastExport {
	format: OrganizationExportFormat;
	at: string;
	actor: string | null;
}

export interface ExportsSettingsData {
	scopeCounts: Promise<ExportScopeCounts>;
}

/** The load that reads the last export declares this; a finished download invalidates it to re-read the Audit log. */
export const LAST_EXPORT_DEPENDENCY = 'app:settings-last-export';

/** Null for a member who cannot read the audit log, so the line stays empty and the read never runs. */
export type LastExportData = Promise<LastExport | null> | null;
