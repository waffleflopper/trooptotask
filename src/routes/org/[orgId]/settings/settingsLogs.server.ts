import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fetchAuditLogs, type AuditLabelReads, type OrganizationAuditStore } from '$lib/audit/index.server';
import { localDateIn, startOfMonthIn } from '$lib/utils/dates';
import type { LogsSettingsData } from './settingsSectionTypes';

export async function loadLogsSettings(
	ctx: { auth: Pick<OrganizationAccessGrant, 'orgId'> },
	store: OrganizationAuditStore,
	labels: AuditLabelReads,
	viewer: { timeZone: string; now: Date }
): Promise<LogsSettingsData> {
	const auditLog = await fetchAuditLogs(
		ctx.auth.orgId,
		store,
		{ page: 1, limit: 100, recentSince: startOfMonthIn(viewer.timeZone, viewer.now).toISOString() },
		labels
	);
	return { auditLog, timeZone: viewer.timeZone, today: localDateIn(viewer.timeZone, viewer.now) };
}
