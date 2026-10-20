/**
 * Audit log query use case — fetches paginated audit events for the org admin audit viewer.
 *
 * Auth events (login, MFA, rate-limit) are excluded from the results by default since
 * they are high-frequency and not useful in the general activity feed. They remain stored
 * in the database and could be queried directly if a dedicated security log view is added.
 *
 * Results are sorted newest-first and support offset-based pagination via `page` and `limit`.
 */
import type { AuditLogEntry, AuditLogQueryInput, AuditLogQueryResult } from './contracts';
import type { OrganizationAuditStore, OrganizationAuditRow } from './organizationAuditStore.server';

/** Delivery binds source-owned reads after Audit admission, without producer imports here. */
export interface AuditLabelReads {
	personnelNames(ids: string[]): Promise<Map<string, string>>;
	trainingTypeNames(ids: string[]): Promise<Map<string, string>>;
	statusTypeNames(ids: string[]): Promise<Map<string, string>>;
	actorEmails(userIds: string[]): Promise<Map<string, string>>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function collectIds(logs: OrganizationAuditRow[], key: string): string[] {
	const ids = new Set<string>();
	for (const log of logs) {
		const v = (log.details as Record<string, unknown> | null)?.[key];
		if (typeof v === 'string' && UUID_RE.test(v)) ids.add(v);
	}
	return [...ids];
}

function enrichDetails(
	details: Record<string, unknown> | null,
	personnelNames: Map<string, string>,
	trainingTypeNames: Map<string, string>,
	statusTypeNames: Map<string, string>
): Record<string, unknown> | null {
	if (!details) return null;

	const enriched = { ...details };

	if (typeof enriched.personnel_id === 'string' && personnelNames.has(enriched.personnel_id)) {
		enriched.personnel = personnelNames.get(enriched.personnel_id)!;
		delete enriched.personnel_id;
	}
	if (typeof enriched.training_type_id === 'string' && trainingTypeNames.has(enriched.training_type_id)) {
		enriched.training_type = trainingTypeNames.get(enriched.training_type_id)!;
		delete enriched.training_type_id;
	}
	if (typeof enriched.status_type_id === 'string' && statusTypeNames.has(enriched.status_type_id)) {
		enriched.status_type = statusTypeNames.get(enriched.status_type_id)!;
		delete enriched.status_type_id;
	}

	for (const [k, v] of Object.entries(enriched)) {
		if (typeof v === 'string' && UUID_RE.test(v)) {
			delete enriched[k];
		}
	}

	return enriched;
}

async function hydrateAuditLogRows(rows: OrganizationAuditRow[], labels: AuditLabelReads): Promise<AuditLogEntry[]> {
	const personnelIds = collectIds(rows, 'personnel_id');
	const trainingTypeIds = collectIds(rows, 'training_type_id');
	const statusTypeIds = collectIds(rows, 'status_type_id');
	const actorUserIds = [
		...new Set(rows.map((log) => log.user_id).filter((id): id is string => typeof id === 'string'))
	];

	const [personnelNames, trainingTypeNames, statusTypeNames, actorEmails] = await Promise.all([
		labels.personnelNames(personnelIds),
		labels.trainingTypeNames(trainingTypeIds),
		labels.statusTypeNames(statusTypeIds),
		labels.actorEmails(actorUserIds)
	]);

	return rows.map((log) => ({
		id: log.id as string,
		userId: (log.user_id as string | null) ?? null,
		actor:
			(typeof (log.details as Record<string, unknown> | null)?.actor === 'string'
				? ((log.details as Record<string, unknown>).actor as string)
				: actorEmails.get(log.user_id as string)) ?? null,
		action: log.action as string,
		resourceType: (log.resource_type as string | null) ?? null,
		resourceId: (log.resource_id as string | null) ?? null,
		details: enrichDetails(
			log.details as Record<string, unknown> | null,
			personnelNames,
			trainingTypeNames,
			statusTypeNames
		),
		createdAt: log.timestamp as string
	}));
}

export async function fetchAuditLogs(
	orgId: string,
	store: OrganizationAuditStore,
	input: AuditLogQueryInput,
	labels: AuditLabelReads
): Promise<AuditLogQueryResult> {
	const { page, action = '', limit = 50 } = input;
	const safePage = Math.max(1, page);
	const offset = (safePage - 1) * limit;
	const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const [pagedResult, last30DaysCount, availableActions] = await Promise.all([
		store.listLogs({ orgId, action: action || undefined, offset, limit }),
		store.countRecent({ orgId, cutoff }),
		store.listActions(orgId)
	]);
	return {
		logs: await hydrateAuditLogRows(pagedResult.logs, labels),
		totalCount: pagedResult.totalCount,
		last30DaysCount,
		page: safePage,
		limit,
		actionFilter: action,
		availableActions
	};
}

/** The newest entry for one action, or null once retention has removed every one. */
export async function fetchLatestAuditEvent(
	orgId: string,
	store: OrganizationAuditStore,
	action: string,
	labels: AuditLabelReads
): Promise<AuditLogEntry | null> {
	const { logs } = await store.listLogs({ orgId, action, offset: 0, limit: 1 });
	const [entry] = await hydrateAuditLogRows(logs, labels);
	return entry ?? null;
}
