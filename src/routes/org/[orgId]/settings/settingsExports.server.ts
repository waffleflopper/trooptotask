import type { AuditLogEntry } from '$lib/audit/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { readUnitCounts } from '$features/organization/index.server';
import {
	EXPORT_SCOPE_COUNT_KEYS,
	type ExportsSettingsData,
	type LastExport,
	type LastExportData,
	type OrganizationExportFormat
} from '$features/data-export/index.web';
import { canReadAuditLog, type SettingsUnitSummaryPorts } from './settingsLoad.server';

const EXPORT_AUDIT_ACTIONS: Record<string, OrganizationExportFormat> = {
	'export.created': 'json',
	'export.excel_created': 'excel'
};

export type SettingsExportsPorts = SettingsUnitSummaryPorts & { disabledFeatures: readonly FeatureKey[] };

async function readLastExport(ports: SettingsUnitSummaryPorts): Promise<LastExport | null> {
	const entries = await Promise.all(
		Object.keys(EXPORT_AUDIT_ACTIONS).map((action) => ports.readLatestAuditEvent(action))
	);
	const latest = entries
		.filter((entry): entry is AuditLogEntry => entry !== null)
		.reduce<AuditLogEntry | null>(
			(newest, entry) => (!newest || Date.parse(entry.createdAt) > Date.parse(newest.createdAt) ? entry : newest),
			null
		);
	return latest && { format: EXPORT_AUDIT_ACTIONS[latest.action], at: latest.createdAt, actor: latest.actor };
}

/** The export tiles render on first paint; the scope counts stream. */
export function loadExportsSettings(ports: SettingsExportsPorts): ExportsSettingsData {
	return {
		disabledFeatures: ports.disabledFeatures,
		scopeCounts: keepStreamedRejectionObserved(readUnitCounts(ports.unitCounts, EXPORT_SCOPE_COUNT_KEYS))
	};
}

/** Streams the newest export event. Its own load, so a finished download re-reads it without recounting the unit. */
export function loadLastExport(ports: SettingsUnitSummaryPorts): LastExportData {
	return canReadAuditLog(ports.auth) ? keepStreamedRejectionObserved(readLastExport(ports)) : null;
}
