/**
 * Audit log query use case — fetches paginated audit events for the org admin audit viewer.
 *
 * Auth events (login, MFA, rate-limit) are excluded from the results by default since
 * they are high-frequency and not useful in the general activity feed. They remain stored
 * in the database and could be queried directly if a dedicated security log view is added.
 *
 * Results are sorted newest-first and support offset-based pagination via `page` and `limit`.
 */
import type { QueryPorts, DataStore } from '$lib/server/core/ports';

const EXCLUDED_ACTIONS = [
	'auth.login_success',
	'auth.login_failure',
	'auth.mfa_verify',
	'security.rate_limit_violation'
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditLogEntry {
	id: string;
	userId: string | null;
	actor: string | null;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	details: Record<string, unknown> | null;
	createdAt: string;
}

export interface AuditLogQueryInput {
	page: number;
	action?: string;
	limit?: number;
}

export interface AuditLogQueryResult {
	logs: AuditLogEntry[];
	totalCount: number;
	last30DaysCount: number;
	page: number;
	limit: number;
	actionFilter: string;
	availableActions: string[];
}

export interface AuditLogPreviewInput {
	limit?: number;
}

function collectIds(logs: Record<string, unknown>[], key: string): string[] {
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

async function resolveNames(
	adminStore: DataStore,
	table: string,
	ids: string[],
	orgId: string
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (ids.length === 0) return map;

	const rows = await adminStore.findMany<Record<string, unknown>>(table, orgId, undefined, {
		inFilters: { id: ids }
	});

	for (const row of rows) {
		if (row.rank !== undefined && row.last_name !== undefined) {
			const parts = [row.rank, row.last_name, row.first_name].filter(Boolean);
			map.set(row.id as string, parts.join(' '));
		} else {
			map.set(row.id as string, (row.name as string) ?? (row.id as string));
		}
	}
	return map;
}

async function resolveActorEmails(
	adminStore: DataStore,
	userIds: string[],
	orgId: string
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (userIds.length === 0) return map;

	const rows = await adminStore.findMany<Record<string, unknown>>('organization_memberships', orgId, undefined, {
		inFilters: { user_id: userIds },
		select: 'user_id, email'
	});

	for (const row of rows) {
		const userId = row.user_id;
		const email = row.email;
		if (typeof userId === 'string' && typeof email === 'string' && email.length > 0) {
			map.set(userId, email);
		}
	}

	return map;
}

async function hydrateAuditLogRows(
	adminStore: DataStore,
	orgId: string,
	rows: Record<string, unknown>[]
): Promise<AuditLogEntry[]> {
	const personnelIds = collectIds(rows, 'personnel_id');
	const trainingTypeIds = collectIds(rows, 'training_type_id');
	const statusTypeIds = collectIds(rows, 'status_type_id');
	const actorUserIds = [
		...new Set(rows.map((log) => log.user_id).filter((id): id is string => typeof id === 'string'))
	];

	const [personnelNames, trainingTypeNames, statusTypeNames, actorEmails] = await Promise.all([
		resolveNames(adminStore, 'personnel', personnelIds, orgId),
		resolveNames(adminStore, 'training_types', trainingTypeIds, orgId),
		resolveNames(adminStore, 'status_types', statusTypeIds, orgId),
		resolveActorEmails(adminStore, actorUserIds, orgId)
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

export async function fetchAuditLogPreview(
	ctx: QueryPorts,
	adminStore: DataStore,
	input: AuditLogPreviewInput = {}
): Promise<AuditLogQueryResult> {
	const orgId = ctx.auth.orgId;
	const limit = input.limit ?? 9;
	const last30DaysCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const baseOptions = {
		notInFilters: { action: EXCLUDED_ACTIONS },
		select: 'id, user_id, action, resource_type, resource_id, details, timestamp'
	};

	const [rows, total, last30Days] = await Promise.all([
		adminStore.findMany<Record<string, unknown>>('audit_logs', orgId, undefined, {
			...baseOptions,
			orderBy: [{ column: 'timestamp', ascending: false }],
			limit
		}),
		adminStore.findManyWithCount<Record<string, unknown>>('audit_logs', orgId, undefined, {
			...baseOptions,
			limit: 0,
			count: 'exact'
		}),
		adminStore.findManyWithCount<Record<string, unknown>>('audit_logs', orgId, undefined, {
			...baseOptions,
			rangeFilters: [{ column: 'timestamp', op: 'gte', value: last30DaysCutoff }],
			limit: 0,
			count: 'exact'
		})
	]);

	return {
		logs: await hydrateAuditLogRows(adminStore, orgId, rows),
		totalCount: total.count ?? 0,
		last30DaysCount: last30Days.count ?? 0,
		page: 1,
		limit,
		actionFilter: '',
		availableActions: []
	};
}

export async function fetchAuditLogs(
	ctx: QueryPorts,
	adminStore: DataStore,
	input: AuditLogQueryInput
): Promise<AuditLogQueryResult> {
	const orgId = ctx.auth.orgId;
	const { page, action = '', limit = 50 } = input;
	const offset = (page - 1) * limit;

	// Trade-off: fetches all logs to compute availableActions (the action filter dropdown).
	// This is fine for typical orgs but could be optimized with a separate SELECT DISTINCT
	// query on the action column if audit_logs grows large for long-lived orgs.
	const allLogs = await adminStore.findMany<Record<string, unknown>>('audit_logs', orgId, undefined, {
		orderBy: [{ column: 'timestamp', ascending: false }]
	});

	// Filter out excluded actions
	let filtered = allLogs.filter((log) => !EXCLUDED_ACTIONS.includes(log.action as string));

	// Collect available actions before action filter
	const availableActions = [...new Set(filtered.map((log) => log.action as string))].sort();
	const last30DaysCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
	const last30DaysCount = filtered.filter(
		(log) => new Date(log.timestamp as string).getTime() >= last30DaysCutoff
	).length;

	// Apply action filter
	if (action) {
		filtered = filtered.filter((log) => log.action === action);
	}

	const totalCount = filtered.length;
	const paged = filtered.slice(offset, offset + limit);

	const logs = await hydrateAuditLogRows(adminStore, orgId, paged);

	return {
		logs,
		totalCount,
		last30DaysCount,
		page,
		limit,
		actionFilter: action,
		availableActions
	};
}
