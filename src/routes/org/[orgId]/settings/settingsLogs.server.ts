import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fetchAuditLogs, type AuditLabelReads, type OrganizationAuditStore } from '$lib/audit/index.server';
import type { AuditLogQueryResult } from '$lib/audit/contracts';

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

export async function loadLogsSettings(
	ctx: { auth: Pick<OrganizationAccessGrant, 'orgId'> },
	store: OrganizationAuditStore,
	labels: AuditLabelReads
): Promise<LogsSettingsData> {
	const orgId = ctx.auth.orgId;
	const auditLogPage = await fetchAuditLogs(orgId, store, { page: 1, limit: 100 }, labels);

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
