import type { DataStore, QueryPorts } from '$lib/server/core/ports';
import { fetchAuditLogs, type AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';

export interface LogsSettingsData {
	sections: {
		logs: SettingsLogsSectionData;
	};
}

export interface SettingsLogsSectionData {
	auditLogPage: AuditLogQueryResult;
}

export interface BuildLogsSettingsDataInput {
	auditLogPage: AuditLogQueryResult;
}

export async function loadLogsSettings(ctx: QueryPorts, adminStore: DataStore): Promise<LogsSettingsData> {
	const auditLogPage = await fetchAuditLogs(ctx, adminStore, {
		page: 1,
		limit: 100
	});

	return buildLogsSettingsData({ auditLogPage });
}

export function buildLogsSettingsData(input: BuildLogsSettingsDataInput): LogsSettingsData {
	return {
		sections: {
			logs: {
				auditLogPage: input.auditLogPage
			}
		}
	};
}
