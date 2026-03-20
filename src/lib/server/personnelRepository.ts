import type { Personnel } from '$lib/types';
import { transformPersonnel } from '$lib/server/transforms';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder type is complex and varies by context
type SupabaseQuery = any;
export type QueryModifier = (query: SupabaseQuery) => SupabaseQuery;

export interface PersonnelQueryConfig {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context
	supabase: any;
	orgId: string;
	select?: string;
	archived?: boolean | 'all';
	scopedGroupId?: string | null;
	orderBy?: Array<{ column: string; ascending?: boolean }>;
	filters?: QueryModifier[];
	range?: { from: number; to: number };
	count?: 'exact' | 'planned' | 'estimated';
	headOnly?: boolean;
	transform?: 'personnel' | 'raw';
}

export interface PersonnelQueryResult<T = Personnel> {
	data: T[];
	count: number | null;
	error: string | null;
}

export async function queryPersonnel<T = Personnel>(config: PersonnelQueryConfig): Promise<PersonnelQueryResult<T>> {
	const {
		supabase,
		orgId,
		select = '*, groups(name)',
		archived = false,
		scopedGroupId = null,
		orderBy = [{ column: 'last_name', ascending: true }],
		filters = [],
		range,
		count,
		headOnly = false,
		transform = 'personnel'
	} = config;

	let query = supabase.from('personnel').select(select);

	query = query.eq('organization_id', orgId);

	// Archive filtering
	if (archived === false) {
		query = query.is('archived_at', null);
	} else if (archived === true) {
		query = query.not('archived_at', 'is', null);
	}
	// archived === 'all' — no filter

	// Group scoping
	if (scopedGroupId) {
		query = query.eq('group_id', scopedGroupId);
	}

	// Custom filters
	for (const filter of filters) {
		query = filter(query);
	}

	// Ordering
	for (const { column, ascending = true } of orderBy) {
		query = query.order(column, { ascending });
	}

	// Pagination
	if (range) {
		query = query.range(range.from, range.to);
	}

	const { data, error, count: resultCount } = await query;

	if (error) {
		return { data: [] as unknown as T[], count: null, error: error.message };
	}

	const rows = data ?? [];

	if (headOnly) {
		return { data: [] as unknown as T[], count: resultCount ?? null, error: null };
	}

	const transformed = transform === 'raw' ? rows : transformPersonnel(rows);
	return { data: transformed as T[], count: resultCount ?? null, error: null };
}

/** Validates that a set of personnel IDs all belong to the given scope.
 *  Used by mutation endpoints to enforce group access on batch operations.
 *  Throws 403 if any personnel are outside scope. */
export async function validatePersonnelScope(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context
	supabase: any,
	orgId: string,
	personnelIdsToCheck: string[],
	scopedGroupId: string | null
): Promise<void> {
	if (!scopedGroupId) return;

	const { data, error } = await supabase
		.from('personnel')
		.select('id, group_id')
		.eq('organization_id', orgId)
		.in('id', personnelIdsToCheck);

	if (error) {
		throw Object.assign(new Error('Failed to validate personnel scope'), { status: 500 });
	}

	const rows = (data ?? []) as Array<{ id: string; group_id: string | null }>;

	if (rows.length !== personnelIdsToCheck.length) {
		throw Object.assign(new Error('One or more personnel not found or access denied'), { status: 403 });
	}

	const outOfScope = rows.some((r) => r.group_id !== scopedGroupId);
	if (outOfScope) {
		throw Object.assign(new Error('Access denied: personnel outside your group scope'), { status: 403 });
	}
}

/** Extract personnel IDs from a query result for use in related-table queries */
export function personnelIds(personnel: Personnel[]): string[] {
	return personnel.map((p) => p.id);
}
