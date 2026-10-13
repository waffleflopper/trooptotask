import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { Group, GroupPersistence } from './contracts';
import { visibleGroupIds } from './groupCatalog.server';
function toGroup(row: Record<string, unknown>): Group {
	return { id: row.id as string, name: row.name as string, sortOrder: row.sort_order as number };
}
export function createSupabaseGroupPersistence(
	client: SupabaseClient,
	orgId: string,
	scopeSet: ScopeSet
): GroupPersistence {
	async function rows(select: string, requestedIds?: string[]) {
		const ids = visibleGroupIds(scopeSet, requestedIds);
		if (ids?.length === 0) return [];
		const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
			let query = client.from('groups').select(select).eq('organization_id', orgId);
			if (ids) query = query.in('id', [...new Set(ids)]);
			const { data, error } = await query
				.order('sort_order', { ascending: true })
				.order('id', { ascending: true })
				.range(from, to)
				.returns<Record<string, unknown>[]>();
			return { data, error };
		});
		if (result.error) throw new Error((result.error as { message: string }).message);
		return result.data ?? [];
	}
	return {
		async listCatalog() {
			return (await rows('*')).map(toGroup);
		},
		async findReference(id) {
			const [row] = await rows('id', [id]);
			return row ? { id: row.id as string } : null;
		},
		async findNamesByIds(ids) {
			return new Map(
				(await rows('id, name', ids))
					.filter((row): row is Record<string, unknown> & { id: string; name: string } => typeof row.name === 'string')
					.map((row) => [row.id, row.name])
			);
		},
		async create(input) {
			const { data, error } = await client
				.from('groups')
				.insert({ organization_id: orgId, name: input.name, sort_order: input.sortOrder ?? 0 })
				.select('*')
				.single<Record<string, unknown>>();
			if (error) throw new Error(error.message);
			return toGroup(data);
		},
		async update(id, patch) {
			const { data, error } = await client
				.from('groups')
				.update({ name: patch.name, sort_order: patch.sortOrder })
				.eq('organization_id', orgId)
				.eq('id', id)
				.select('*')
				.single<Record<string, unknown>>();
			if (error) throw new Error(error.message);
			return toGroup(data);
		},
		async delete(id) {
			const { error } = await client.from('groups').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		}
	};
}
