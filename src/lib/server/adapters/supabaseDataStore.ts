/**
 * Supabase implementation of the DataStore port.
 *
 * All reads and writes are automatically scoped to the caller's organization via an org column.
 * Most tables use `organization_id`; exceptions (audit_logs, data_exports) use `org_id` and
 * are handled by `getOrgColumn`.
 *
 * For group-scoped member access, wrap the returned store with `createScopedDataStore`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataStore, FindOptions, FindResult } from '../core/ports';

function getOrgColumn(table: string): string {
	switch (table) {
		case 'audit_logs':
		case 'data_exports':
			return 'org_id';
		default:
			return 'organization_id';
	}
}

/**
 * Applies filtering, ordering, range and limit constraints to a Supabase query builder.
 *
 * Applies equality filters from `filters` and `options.filters`; `in` filters from `options.inFilters`; null checks from `options.isNull`; case-insensitive pattern matches from `options.ilikeFilters`; range comparisons from `options.rangeFilters`; ordering from `options.orderBy`; result range from `options.range`; and a row limit from `options.limit`.
 *
 * @param query - Supabase query builder to modify
 * @param filters - Key/value pairs to apply as equality (`eq`) conditions
 * @param options - Structured find options controlling additional filters, ordering, range, and limit
 * @returns The modified Supabase query builder with the requested constraints applied
 */
function applyFindOptions(query: any, filters?: Record<string, unknown>, options?: FindOptions) {
	if (filters) {
		for (const [key, value] of Object.entries(filters)) {
			query = query.eq(key, value);
		}
	}

	if (options?.filters) {
		for (const [key, value] of Object.entries(options.filters)) {
			query = query.eq(key, value);
		}
	}

	if (options?.inFilters) {
		for (const [key, values] of Object.entries(options.inFilters)) {
			query = query.in(key, values);
		}
	}

	if (options?.isNull) {
		for (const [key, shouldBeNull] of Object.entries(options.isNull)) {
			query = shouldBeNull ? query.is(key, null) : query.not(key, 'is', null);
		}
	}

	if (options?.ilikeFilters) {
		for (const [key, pattern] of Object.entries(options.ilikeFilters)) {
			query = query.ilike(key, pattern);
		}
	}

	if (options?.rangeFilters) {
		for (const { column, op, value } of options.rangeFilters) {
			query = query[op](column, value);
		}
	}

	if (options?.orderBy) {
		for (const { column, ascending } of options.orderBy) {
			query = query.order(column, { ascending });
		}
	}

	if (options?.range) {
		query = query.range(options.range.from, options.range.to);
	}

	if (options?.limit !== undefined) {
		query = query.limit(options.limit);
	}

	return query;
}

/**
 * Creates a server-side DataStore adapter that uses the provided Supabase client.
 *
 * The adapter's methods automatically scope operations to an organization column determined by the table:
 * `org_id` is used for `audit_logs` and `data_exports`; otherwise `organization_id` is used.
 *
 * @param supabase - Supabase client used to perform all database operations
 * @returns A DataStore implementation backed by the given Supabase client
 */
export function createSupabaseDataStore(supabase: SupabaseClient): DataStore {
	return {
		async findOne<T>(
			table: string,
			orgId: string,
			filters: Record<string, unknown>,
			select?: string
		): Promise<T | null> {
			const orgColumn = getOrgColumn(table);
			let query = supabase
				.from(table)
				.select(select ?? '*')
				.eq(orgColumn, orgId);

			for (const [key, value] of Object.entries(filters)) {
				query = query.eq(key, value);
			}

			const { data, error } = await query.single();

			if (error) {
				if (error.code === 'PGRST116') return null;
				throw new Error(error.message);
			}

			return data as T;
		},

		async findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FindOptions
		): Promise<T[]> {
			const orgColumn = getOrgColumn(table);
			let query = supabase
				.from(table)
				.select(options?.select ?? '*')
				.eq(orgColumn, orgId);

			query = applyFindOptions(query, filters, options);

			const { data, error } = await query;

			if (error) {
				throw new Error(error.message);
			}

			return (data ?? []) as T[];
		},

		async findManyWithCount<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FindOptions
		): Promise<FindResult<T>> {
			const countMode = options?.count ?? 'exact';
			const orgColumn = getOrgColumn(table);
			let query = supabase
				.from(table)
				.select(options?.select ?? '*', { count: countMode })
				.eq(orgColumn, orgId);

			query = applyFindOptions(query, filters, options);

			const { data, error, count } = await query;

			if (error) {
				throw new Error(error.message);
			}

			return { data: (data ?? []) as T[], count: count ?? null };
		},

		async insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T> {
			const orgColumn = getOrgColumn(table);
			const { data: row, error } = await supabase
				.from(table)
				.insert({ ...data, [orgColumn]: orgId })
				.select(select ?? '*')
				.single();

			if (error) throw new Error(error.message);
			return row as T;
		},

		async update<T>(
			table: string,
			orgId: string,
			id: string,
			data: Record<string, unknown>,
			select?: string
		): Promise<T> {
			const orgColumn = getOrgColumn(table);
			const { data: row, error } = await supabase
				.from(table)
				.update(data)
				.eq(orgColumn, orgId)
				.eq('id', id)
				.select(select ?? '*')
				.single();

			if (error) throw new Error(error.message);
			return row as T;
		},

		async updateById<T>(table: string, id: string, data: Record<string, unknown>, select?: string): Promise<T> {
			const { data: row, error } = await supabase
				.from(table)
				.update(data)
				.eq('id', id)
				.select(select ?? '*')
				.single();

			if (error) throw new Error(error.message);
			return row as T;
		},

		async delete(table: string, orgId: string, id: string): Promise<void> {
			const orgColumn = getOrgColumn(table);
			const { error } = await supabase.from(table).delete().eq(orgColumn, orgId).eq('id', id);

			if (error) throw new Error(error.message);
		},

		async deleteManyByIds(table: string, orgId: string, ids: string[]): Promise<number> {
			if (ids.length === 0) return 0;
			const orgColumn = getOrgColumn(table);

			const { data, error } = await supabase.from(table).delete().eq(orgColumn, orgId).in('id', ids).select('id');

			if (error) throw new Error(error.message);
			return data?.length ?? 0;
		},

		async deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void> {
			const orgColumn = getOrgColumn(table);
			let query = supabase.from(table).delete().eq(orgColumn, orgId);

			for (const [key, value] of Object.entries(filters)) {
				query = query.eq(key, value);
			}

			const { error } = await query;
			if (error) throw new Error(error.message);
		},

		async insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]> {
			const orgColumn = getOrgColumn(table);
			const withOrg = rows.map((row) => ({ ...row, [orgColumn]: orgId }));

			const { data, error } = await supabase
				.from(table)
				.insert(withOrg)
				.select(select ?? '*');

			if (error) throw new Error(error.message);
			return (data ?? []) as T[];
		}
	};
}
