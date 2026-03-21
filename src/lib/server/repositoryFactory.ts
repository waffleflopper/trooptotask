/**
 * Repository Factory — centralized read query module.
 * Creates typed repositories for org-scoped database tables.
 * Complements crudFactory (which handles mutations). See #216.
 */
import type { QueryModifier } from './personnelRepository';

export type { QueryModifier };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context
type SupabaseClient = any;

export interface RepositoryConfig<T> {
	table: string;
	transform: (rows: Record<string, unknown>[]) => T[];
	select?: string;
	orderBy?: Array<{ column: string; ascending?: boolean }>;
	orgScoped?: boolean;
}

export interface QueryOptions {
	select?: string;
	orderBy?: Array<{ column: string; ascending?: boolean }>;
	filters?: QueryModifier[];
	count?: 'exact' | 'planned' | 'estimated';
}

export interface QueryResult<T> {
	data: T[];
	count: number | null;
	error: string | null;
}

export interface Repository<T> {
	query(supabase: SupabaseClient, orgId: string, options?: QueryOptions): Promise<QueryResult<T>>;
	list(supabase: SupabaseClient, orgId: string, options?: QueryOptions): Promise<T[]>;
	queryDateRange(
		supabase: SupabaseClient,
		orgId: string,
		range: { column: string; start: string; end: string },
		options?: QueryOptions
	): Promise<QueryResult<T>>;
	queryByIds(
		supabase: SupabaseClient,
		orgId: string,
		column: string,
		ids: string[],
		options?: QueryOptions
	): Promise<QueryResult<T>>;
}

export function createRepository<T>(config: RepositoryConfig<T>): Repository<T> {
	const { table, transform, select: defaultSelect = '*', orderBy: defaultOrderBy = [], orgScoped = true } = config;

	async function query(supabase: SupabaseClient, orgId: string, options?: QueryOptions): Promise<QueryResult<T>> {
		const select = options?.select ?? defaultSelect;
		const orderBy = options?.orderBy ?? defaultOrderBy;
		const filters = options?.filters ?? [];

		const hasCount = !!options?.count;
		let q = hasCount
			? supabase.from(table).select(select, { count: options!.count })
			: supabase.from(table).select(select);

		if (orgScoped) {
			q = q.eq('organization_id', orgId);
		}

		for (const filter of filters) {
			q = filter(q);
		}

		for (const { column, ascending = true } of orderBy) {
			q = q.order(column, { ascending });
		}

		const { data, error, count: resultCount } = await q;

		if (error) {
			return { data: [], count: null, error: error.message };
		}

		return {
			data: transform(data ?? []),
			count: resultCount ?? null,
			error: null
		};
	}

	async function list(supabase: SupabaseClient, orgId: string, options?: QueryOptions): Promise<T[]> {
		const result = await query(supabase, orgId, options);
		return result.data;
	}

	async function queryDateRange(
		supabase: SupabaseClient,
		orgId: string,
		range: { column: string; start: string; end: string },
		options?: QueryOptions
	): Promise<QueryResult<T>> {
		const dateFilter: QueryModifier = (q) => q.gte(range.column, range.start).lte(range.column, range.end);
		const merged: QueryOptions = {
			...options,
			filters: [...(options?.filters ?? []), dateFilter]
		};
		return query(supabase, orgId, merged);
	}

	async function queryByIds(
		supabase: SupabaseClient,
		orgId: string,
		column: string,
		ids: string[],
		options?: QueryOptions
	): Promise<QueryResult<T>> {
		const idFilter: QueryModifier = (q) => q.in(column, ids);
		const merged: QueryOptions = {
			...options,
			filters: [...(options?.filters ?? []), idFilter]
		};
		return query(supabase, orgId, merged);
	}

	return { query, list, queryDateRange, queryByIds };
}
