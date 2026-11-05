/**
 * Auth events (login, MFA, rate-limit) are excluded from the results by default since
 * they are high-frequency and not useful in the general activity feed. They remain stored
 * in the database and could be queried directly if a dedicated security log view is added.
 *
 * Results are sorted newest-first and paged by cursor on (timestamp, id).
 */
import { startOfDayIn, startOfNextDayIn } from '$lib/utils/dates';
import { decodeAuditLogCursor, encodeAuditLogCursor, type AuditLogFilters } from './auditLogFilters';
import type { AuditLogEntry, AuditLogQueryInput, AuditLogQueryResult } from './contracts';
import type {
	OrganizationAuditFilters,
	OrganizationAuditRow,
	OrganizationAuditStore
} from './organizationAuditStore.server';

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
		const v = log.details?.[key];
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

/** An entry with saved labels reads as written. Only older entries look names up, which can change or vanish. */
function hasSavedLabels(log: OrganizationAuditRow): boolean {
	return !!(log.record_label || log.subject_label);
}

async function hydrateAuditLogRows(rows: OrganizationAuditRow[], labels: AuditLabelReads): Promise<AuditLogEntry[]> {
	const legacy = rows.filter((log) => !hasSavedLabels(log));
	const actorUserIds = [
		...new Set(rows.filter((log) => log.actor_label == null && log.user_id).map((log) => log.user_id as string))
	];

	const [personnelNames, trainingTypeNames, statusTypeNames, actorEmails] = await Promise.all([
		labels.personnelNames(collectIds(legacy, 'personnel_id')),
		labels.trainingTypeNames(collectIds(legacy, 'training_type_id')),
		labels.statusTypeNames(collectIds(legacy, 'status_type_id')),
		labels.actorEmails(actorUserIds)
	]);

	return rows.map((log) => {
		return {
			id: log.id,
			userId: log.user_id ?? null,
			actor:
				log.actor_label ??
				(typeof log.details?.actor === 'string'
					? log.details.actor
					: log.user_id
						? actorEmails.get(log.user_id)
						: undefined) ??
				null,
			action: log.action,
			resourceType: log.resource_type ?? null,
			resourceId: log.resource_id ?? null,
			details: hasSavedLabels(log)
				? log.details
				: enrichDetails(log.details, personnelNames, trainingTypeNames, statusTypeNames),
			recordLabel: log.record_label ?? null,
			subject: log.subject_label ? { personnelId: log.subject_personnel_id ?? null, label: log.subject_label } : null,
			batchId: log.batch_id ?? null,
			createdAt: log.timestamp
		};
	});
}

export const AUDIT_LOG_PAGE_SIZE = 50;

/** The filters as the store reads them: the first day starts at its midnight and the last day ends at the next one. */
function storeFilters(filters: AuditLogFilters, timeZone: string): OrganizationAuditFilters {
	return {
		personId: filters.personId,
		userId: filters.userId,
		action: filters.kind,
		since: filters.from ? startOfDayIn(timeZone, filters.from).toISOString() : undefined,
		until: filters.to ? startOfNextDayIn(timeZone, filters.to).toISOString() : undefined
	};
}

/**
 * One page of the unit log, newest first. Paging is by entries, not by action, so an action that wrote many entries can
 * span two pages. Its entries share one timestamp, so they sit together, and Activity joins them once both pages are loaded.
 */
export async function fetchAuditLogs(
	orgId: string,
	store: OrganizationAuditStore,
	input: AuditLogQueryInput,
	labels: AuditLabelReads
): Promise<AuditLogQueryResult> {
	const after = input.after ? decodeAuditLogCursor(input.after) : null;
	if (input.after && !after) throw new Error('Invalid audit log cursor');
	const { logs, hasMore } = await store.listLogs({
		orgId,
		filters: storeFilters(input.filters, input.timeZone),
		after: after ?? undefined,
		limit: input.limit ?? AUDIT_LOG_PAGE_SIZE
	});
	const oldest = logs.at(-1);
	return {
		logs: await hydrateAuditLogRows(logs, labels),
		nextCursor: hasMore && oldest ? encodeAuditLogCursor({ timestamp: oldest.timestamp, id: oldest.id }) : null
	};
}

/** The newest entry for one action, or null once retention has removed every one. */
export async function fetchLatestAuditEvent(
	orgId: string,
	store: OrganizationAuditStore,
	action: string,
	labels: AuditLabelReads
): Promise<AuditLogEntry | null> {
	const { logs } = await store.listLogs({ orgId, filters: { action }, limit: 1 });
	const [entry] = await hydrateAuditLogRows(logs, labels);
	return entry ?? null;
}
