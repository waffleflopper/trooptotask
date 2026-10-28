import type { SupabaseClient } from '$lib/server/database';
import { fail } from '$lib/errors';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import {
	GROUP_CHANGE_UNCONFIRMED_MESSAGE,
	GROUP_NAME_EXISTS_MESSAGE,
	GROUP_ORDER_CHANGED_MESSAGE,
	GROUP_UNAVAILABLE_MESSAGE,
	type Group,
	type GroupPersistence
} from './contracts';
import { visibleGroupIds } from './groupCatalog.server';
function throwGroupWriteError(error: { code?: string; message: string }): never {
	if (error.code === '23505' && error.message.includes('"groups_clinic_id_name_key"')) {
		fail(409, GROUP_NAME_EXISTS_MESSAGE);
	}
	throw new Error(error.message);
}
// postgrest-js reports a failed fetch as an error with an empty code instead of rejecting.
function throwGroupCommandError(error: { code?: string; message: string }): never {
	if (error.code === '42501') fail(403, 'You do not have permission to manage Groups');
	if (error.code === 'P0002') fail(404, GROUP_UNAVAILABLE_MESSAGE);
	if (error.code === '22023' || error.code === '22P02') fail(400, 'Invalid Group change');
	if (['GRP01', '40P01', '40001', '55P03'].includes(error.code ?? '')) fail(409, GROUP_ORDER_CHANGED_MESSAGE);
	if (error.code === '23505') fail(409, GROUP_NAME_EXISTS_MESSAGE);
	if (error.code === '23503' && error.message.includes('calendar_taskings_responsible_group_fkey'))
		fail(409, 'This Group is now responsible for a tasking. Move it to another Group or the organization first.');
	if (!error.code) fail(503, GROUP_CHANGE_UNCONFIRMED_MESSAGE, { publicMessage: true });
	throw new Error(error.message);
}
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
				.order('name', { ascending: true })
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
			if (error) throwGroupWriteError(error);
			return toGroup(data);
		},
		async rename(id, name) {
			const { data, error } = await client.rpc('rename_group', {
				p_organization_id: orgId,
				p_group_id: id,
				p_name: name
			});
			if (error) throwGroupCommandError(error);
			const [row] = (data ?? []) as Record<string, unknown>[];
			if (!row) fail(404, GROUP_UNAVAILABLE_MESSAGE);
			return toGroup(row);
		},
		async setOrder(ids, expectedIds) {
			const { error } = await client.rpc('set_group_order', {
				p_organization_id: orgId,
				p_group_ids: ids,
				p_expected_group_ids: expectedIds
			});
			if (error) throwGroupCommandError(error);
		},
		async deleteWithReassignment(id, targetId) {
			const { data, error } = await client.rpc('delete_group_with_reassignment', {
				p_organization_id: orgId,
				p_group_id: id,
				p_target_group_id: targetId
			});
			if (error) throwGroupCommandError(error);
			if (!Number.isInteger(data)) throw new Error('Group delete returned an unexpected result');
			return data as number;
		}
	};
}
