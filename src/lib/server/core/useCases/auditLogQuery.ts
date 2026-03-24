import type { UseCaseContext, DataStore } from '$lib/server/core/ports';

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
	page: number;
	limit: number;
	actionFilter: string;
	availableActions: string[];
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

export async function fetchAuditLogs(
	ctx: UseCaseContext,
	adminStore: DataStore,
	input: AuditLogQueryInput
): Promise<AuditLogQueryResult> {
	const orgId = ctx.auth.orgId;
	const { page, action = '', limit = 50 } = input;
	const offset = (page - 1) * limit;

	// Fetch all logs for this org (in-memory filtering for excluded actions)
	const allLogs = await adminStore.findMany<Record<string, unknown>>('audit_logs', orgId, undefined, {
		orderBy: [{ column: 'timestamp', ascending: false }]
	});

	// Filter out excluded actions
	let filtered = allLogs.filter((log) => !EXCLUDED_ACTIONS.includes(log.action as string));

	// Collect available actions before action filter
	const availableActions = [...new Set(filtered.map((log) => log.action as string))].sort();

	// Apply action filter
	if (action) {
		filtered = filtered.filter((log) => log.action === action);
	}

	const totalCount = filtered.length;
	const paged = filtered.slice(offset, offset + limit);

	// Batch-resolve UUIDs to human-readable names
	const personnelIds = collectIds(paged, 'personnel_id');
	const trainingTypeIds = collectIds(paged, 'training_type_id');
	const statusTypeIds = collectIds(paged, 'status_type_id');

	const [personnelNames, trainingTypeNames, statusTypeNames] = await Promise.all([
		resolveNames(adminStore, 'personnel', personnelIds, orgId),
		resolveNames(adminStore, 'training_types', trainingTypeIds, orgId),
		resolveNames(adminStore, 'status_types', statusTypeIds, orgId)
	]);

	const logs: AuditLogEntry[] = paged.map((log) => ({
		id: log.id as string,
		userId: (log.user_id as string | null) ?? null,
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

	return {
		logs,
		totalCount,
		page,
		limit,
		actionFilter: action,
		availableActions
	};
}
