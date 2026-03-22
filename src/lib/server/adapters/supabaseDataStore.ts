import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataStore, FindOptions } from '../core/ports';

export function createSupabaseDataStore(supabase: SupabaseClient): DataStore {
	return {
		async findOne<T>(
			table: string,
			orgId: string,
			filters: Record<string, unknown>,
			select?: string
		): Promise<T | null> {
			let query = supabase
				.from(table)
				.select(select ?? '*')
				.eq('organization_id', orgId);

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
			let query = supabase
				.from(table)
				.select(options?.select ?? '*')
				.eq('organization_id', orgId);

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

			if (options?.orderBy) {
				for (const { column, ascending } of options.orderBy) {
					query = query.order(column, { ascending });
				}
			}

			if (options?.limit !== undefined) {
				query = query.limit(options.limit);
			}

			const { data, error } = await query;

			if (error) {
				throw new Error(error.message);
			}

			return (data ?? []) as T[];
		},

		async insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T> {
			const { data: row, error } = await supabase
				.from(table)
				.insert({ ...data, organization_id: orgId })
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
			const { data: row, error } = await supabase
				.from(table)
				.update(data)
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(select ?? '*')
				.single();

			if (error) throw new Error(error.message);
			return row as T;
		},

		async delete(table: string, orgId: string, id: string): Promise<void> {
			const { error } = await supabase.from(table).delete().eq('organization_id', orgId).eq('id', id);

			if (error) throw new Error(error.message);
		},

		async deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void> {
			let query = supabase.from(table).delete().eq('organization_id', orgId);

			for (const [key, value] of Object.entries(filters)) {
				query = query.eq(key, value);
			}

			const { error } = await query;
			if (error) throw new Error(error.message);
		},

		async insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]> {
			const withOrg = rows.map((row) => ({ ...row, organization_id: orgId }));

			const { data, error } = await supabase
				.from(table)
				.insert(withOrg)
				.select(select ?? '*');

			if (error) throw new Error(error.message);
			return (data ?? []) as T[];
		}
	};
}
