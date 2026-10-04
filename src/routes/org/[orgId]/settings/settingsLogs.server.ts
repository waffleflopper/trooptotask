import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { DataStore } from '$lib/server/core/ports';
import { fetchAuditLogs, createSupabaseOrganizationAuditStore } from '$lib/audit/index.server';
import type { AuditLogQueryResult } from '$lib/audit/contracts';
import { listStatusTypeNamesByIds } from '$features/calendar/index.server';
import { listPersonnelNamesByIds } from '$features/personnel/index.server';
import { listTrainingTypeNamesByIds } from '$features/training/index.server';
import { listOrganizationMemberEmailsByUserIds } from '$features/organization/index.server';
import type { SupabaseClient } from '@supabase/supabase-js';

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
	adminStore: DataStore,
	adminClient: SupabaseClient
): Promise<LogsSettingsData> {
	const orgId = ctx.auth.orgId;
	const auditLogPage = await fetchAuditLogs(
		orgId,
		createSupabaseOrganizationAuditStore(adminClient),
		{ page: 1, limit: 100 },
		{
			personnelNames: (ids) => listPersonnelNamesByIds(adminStore, orgId, ids),
			trainingTypeNames: (ids) => listTrainingTypeNamesByIds(adminStore, orgId, ids),
			statusTypeNames: (ids) => listStatusTypeNamesByIds(adminStore, orgId, ids),
			actorEmails: (ids) => listOrganizationMemberEmailsByUserIds(adminStore, orgId, ids)
		}
	);

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
