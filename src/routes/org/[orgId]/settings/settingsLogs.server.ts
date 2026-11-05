import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fetchAuditLogs, type AuditLabelReads, type OrganizationAuditStore } from '$lib/audit/index.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { localDateIn, startOfMonthIn } from '$lib/utils/dates';
import type { LogsSettingsData } from './settingsSectionTypes';

/** The header and controls render on first paint; the entries stream, so a failed read stays inside the page. */
export function loadLogsSettings(
	ctx: { auth: Pick<OrganizationAccessGrant, 'orgId'> },
	store: OrganizationAuditStore,
	labels: AuditLabelReads,
	viewer: { timeZone: string; now: Date }
): LogsSettingsData {
	const auditLog = fetchAuditLogs(
		ctx.auth.orgId,
		store,
		{ page: 1, limit: 100, recentSince: startOfMonthIn(viewer.timeZone, viewer.now).toISOString() },
		labels
	);
	return {
		auditLog: keepStreamedRejectionObserved(auditLog),
		timeZone: viewer.timeZone,
		today: localDateIn(viewer.timeZone, viewer.now)
	};
}
