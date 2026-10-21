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
	/** Null for a member who cannot read the audit log, so the line stays empty and the read never runs. */
	lastExport: Promise<LastExport | null> | null;
}
