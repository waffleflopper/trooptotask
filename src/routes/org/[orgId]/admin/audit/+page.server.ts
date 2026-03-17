import type { PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';

/** Actions that are site-wide (auth, rate-limit, etc.) — excluded from org audit view */
const EXCLUDED_ACTIONS = [
	'auth.login_success',
	'auth.login_failure',
	'auth.mfa_verify',
	'security.rate_limit_violation'
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collect unique UUIDs from a specific key across all log details */
function collectIds(logs: Record<string, unknown>[], key: string): string[] {
	const ids = new Set<string>();
	for (const log of logs) {
		const v = (log.details as Record<string, unknown> | null)?.[key];
		if (typeof v === 'string' && UUID_RE.test(v)) ids.add(v);
	}
	return [...ids];
}

/** Batch-fetch names for a set of IDs from a table */
async function resolveNames(
	supabase: ReturnType<typeof getAdminClient>,
	table: string,
	ids: string[],
	nameColumns: string[] = ['name']
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (ids.length === 0) return map;

	const selectCols = ['id', ...nameColumns].join(', ');
	const { data } = await supabase.from(table).select(selectCols).in('id', ids);
	if (!data) return map;

	for (const row of data as unknown as Record<string, unknown>[]) {
		// For personnel: "rank last_name, first_name"; for others: "name"
		if (row.rank !== undefined && row.last_name !== undefined) {
			const parts = [row.rank, row.last_name, row.first_name].filter(Boolean);
			map.set(row.id as string, parts.join(' '));
		} else {
			map.set(row.id as string, (row.name as string) ?? (row.id as string));
		}
	}
	return map;
}

/**
 * Replace UUID fields in details with human-readable names.
 * Mutates the details object in-place.
 */
function enrichDetails(
	details: Record<string, unknown> | null,
	personnelNames: Map<string, string>,
	trainingTypeNames: Map<string, string>,
	statusTypeNames: Map<string, string>
): void {
	if (!details) return;

	if (typeof details.personnel_id === 'string' && personnelNames.has(details.personnel_id)) {
		details.personnel = personnelNames.get(details.personnel_id)!;
		delete details.personnel_id;
	}
	if (typeof details.training_type_id === 'string' && trainingTypeNames.has(details.training_type_id)) {
		details.training_type = trainingTypeNames.get(details.training_type_id)!;
		delete details.training_type_id;
	}
	if (typeof details.status_type_id === 'string' && statusTypeNames.has(details.status_type_id)) {
		details.status_type = statusTypeNames.get(details.status_type_id)!;
		delete details.status_type_id;
	}

	// Strip any remaining UUID values (resource_id, etc.) — they aren't useful to display
	for (const [k, v] of Object.entries(details)) {
		if (typeof v === 'string' && UUID_RE.test(v)) {
			delete details[k];
		}
	}
}

export const load: PageServerLoad = async ({ params, url }) => {
	const { orgId } = params;
	const supabase = getAdminClient();

	const page = parseInt(url.searchParams.get('page') || '1');
	const action = url.searchParams.get('action') || '';
	const limit = 50;
	const offset = (page - 1) * limit;

	// Build query — scoped to this org, excluding site-wide auth events
	let query = supabase.from('audit_logs').select('*', { count: 'exact' }).eq('org_id', orgId);

	for (const excluded of EXCLUDED_ACTIONS) {
		query = query.neq('action', excluded);
	}

	if (action) {
		query = query.eq('action', action);
	}

	query = query.order('timestamp', { ascending: false }).range(offset, offset + limit - 1);

	// Get available actions for filter dropdown (scoped to org)
	const [logsResult, actionsResult] = await Promise.all([
		query,
		supabase
			.from('audit_logs')
			.select('action')
			.eq('org_id', orgId)
			.not('action', 'in', `(${EXCLUDED_ACTIONS.join(',')})`)
			.order('timestamp', { ascending: false })
			.limit(1000)
	]);

	const { data: logs, count } = logsResult;
	const logList = (logs ?? []) as unknown as Record<string, unknown>[];

	const uniqueActions = [...new Set((actionsResult.data ?? []).map((a: { action: string }) => a.action))].sort();

	// Batch-resolve UUIDs to human-readable names
	const personnelIds = collectIds(logList, 'personnel_id');
	const trainingTypeIds = collectIds(logList, 'training_type_id');
	const statusTypeIds = collectIds(logList, 'status_type_id');

	const [personnelNames, trainingTypeNames, statusTypeNames] = await Promise.all([
		resolveNames(supabase, 'personnel', personnelIds, ['rank', 'last_name', 'first_name']),
		resolveNames(supabase, 'training_types', trainingTypeIds),
		resolveNames(supabase, 'status_types', statusTypeIds)
	]);

	// Enrich details with resolved names
	for (const log of logList) {
		if (log.details) {
			// Clone to avoid mutating the original
			log.details = { ...(log.details as Record<string, unknown>) };
			enrichDetails(log.details as Record<string, unknown>, personnelNames, trainingTypeNames, statusTypeNames);
		}
	}

	return {
		logs: logList.map((log) => ({
			id: log.id as string,
			userId: log.user_id as string | null,
			action: log.action as string,
			resourceType: log.resource_type as string | null,
			resourceId: log.resource_id as string | null,
			details: log.details as Record<string, unknown> | null,
			createdAt: log.timestamp as string
		})),
		totalCount: count ?? 0,
		page,
		limit,
		actionFilter: action,
		availableActions: uniqueActions
	};
};
