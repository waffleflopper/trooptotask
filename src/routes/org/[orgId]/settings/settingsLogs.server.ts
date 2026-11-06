import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import {
	fetchAuditLogs,
	type AuditLabelReads,
	type AuditLogFilters,
	type OrganizationAuditStore
} from '$lib/audit/index.server';
import { formatRosterPersonDisplayName, type PersonnelRosterReader } from '$features/personnel/contracts';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { localDateIn } from '$lib/utils/dates';
import type { LogsFilterOptions, LogsSettingsData } from './settingsSectionTypes';

/** The header and filters render on first paint; the entries stream, so a failed read stays inside the page. */
export function loadLogsSettings(
	ctx: { auth: Pick<OrganizationAccessGrant, 'orgId'> },
	store: OrganizationAuditStore,
	labels: AuditLabelReads,
	viewer: { timeZone: string; now: Date; filters: AuditLogFilters }
): LogsSettingsData {
	const auditLog = fetchAuditLogs(
		ctx.auth.orgId,
		store,
		{ filters: viewer.filters, timeZone: viewer.timeZone },
		labels
	);
	return {
		auditLog: keepStreamedRejectionObserved(auditLog),
		filters: viewer.filters,
		timeZone: viewer.timeZone,
		today: localDateIn(viewer.timeZone, viewer.now)
	};
}

/**
 * Who and what the pickers offer, read once per visit. People come from the roster the viewer can see, archived ones
 * included, because entries about them stay in the log. Members are the current ones. Actions are those the unit
 * has recorded, so an older action stays pickable after it leaves the catalog.
 */
export function loadLogsFilterOptions(
	ctx: { auth: Pick<OrganizationAccessGrant, 'orgId'> },
	reads: {
		roster: PersonnelRosterReader;
		memberLabels: () => Promise<Record<string, string>>;
		store: OrganizationAuditStore;
	}
): Promise<LogsFilterOptions> {
	return keepStreamedRejectionObserved(
		Promise.all([
			reads.roster.list({ status: 'all' }),
			reads.memberLabels(),
			reads.store.listActions(ctx.auth.orgId)
		]).then(([people, members, actions]) => ({
			people: people.map((person) => ({
				id: person.id,
				label: formatRosterPersonDisplayName(person),
				archived: person.archivedAt !== null
			})),
			members: Object.entries(members).map(([userId, label]) => ({ userId, label })),
			actions
		}))
	);
}
