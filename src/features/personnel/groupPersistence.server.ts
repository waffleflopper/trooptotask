import type { SupabaseClient } from '$lib/server/database';
import { fail } from '$lib/errors';
import type { GroupCoverage } from '$lib/access/memberAccessShape';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import {
	GROUP_CHANGE_UNCONFIRMED_MESSAGE,
	GROUP_NAME_EXISTS_MESSAGE,
	GROUP_ORDER_CHANGED_MESSAGE,
	GROUP_PARENT_GONE_MESSAGE,
	GROUP_UNAVAILABLE_MESSAGE,
	type Group,
	type GroupPersistence
} from './contracts';
import { visibleGroupIds } from './groupCatalog.server';
const GROUP_DEPTH_MESSAGE = 'Groups can nest at most three levels deep.';
function isDepthViolation(error: { code?: string; message: string }) {
	return error.code === '23514' && error.message.includes('groups_path_shape');
}
// `set_group_path` raises the parent key's 23503 itself, before the constraint runs, so the message may not name it.
function isMissingParent(error: { code?: string; message: string }) {
	return (
		error.code === '23503' &&
		(error.message.includes('groups_parent_fkey') || error.message.includes('Parent Group not found'))
	);
}
function throwGroupWriteError(error: { code?: string; message: string }): never {
	if (error.code === '22023' && error.message.includes('inside itself'))
		fail(400, 'A Group cannot move under one of its own sub-groups.');
	if (error.code === '22023') fail(400, 'Group names cannot contain " / ".');
	if (isDepthViolation(error)) fail(400, GROUP_DEPTH_MESSAGE);
	if (isMissingParent(error)) fail(400, GROUP_PARENT_GONE_MESSAGE);
	if (error.code === '23505' && error.message.includes('"groups_sibling_name_key"')) {
		fail(409, GROUP_NAME_EXISTS_MESSAGE);
	}
	throw new Error(error.message);
}
// postgrest-js reports a failed fetch as an error with an empty code instead of rejecting.
function throwGroupCommandError(error: { code?: string; message: string }): never {
	if (error.code === '42501') fail(403, 'You do not have permission to manage Groups');
	if (error.code === 'P0002') fail(404, GROUP_UNAVAILABLE_MESSAGE);
	if (isDepthViolation(error)) fail(400, GROUP_DEPTH_MESSAGE);
	if (isMissingParent(error)) fail(400, GROUP_PARENT_GONE_MESSAGE);
	if (error.code === '22023' || error.code === '22P02') fail(400, 'Invalid Group change');
	if (['GRP01', '40P01', '40001', '55P03'].includes(error.code ?? '')) fail(409, GROUP_ORDER_CHANGED_MESSAGE);
	if (error.code === '23505') fail(409, GROUP_NAME_EXISTS_MESSAGE);
	if (error.code === '23503' && error.message.includes('calendar_taskings_responsible_group_fkey'))
		fail(409, 'This Group is now responsible for a tasking. Move it to another Group or the organization first.');
	if (!error.code) fail(503, GROUP_CHANGE_UNCONFIRMED_MESSAGE, { publicMessage: true });
	throw new Error(error.message);
}
function toGroup(row: Record<string, unknown>): Group {
	const depth = row.depth;
	if (depth !== 1 && depth !== 2 && depth !== 3) throw new Error('Invalid Group depth');
	return {
		id: row.id as string,
		name: row.name as string,
		sortOrder: row.sort_order as number,
		parentId: row.parent_id as string | null,
		depth
	};
}
export function createSupabaseGroupPersistence(
	client: SupabaseClient,
	orgId: string,
	scopeSet: GroupCoverage
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
		async create(input) {
			const { data, error } = await client
				.from('groups')
				.insert({
					organization_id: orgId,
					name: input.name,
					sort_order: input.sortOrder ?? 0,
					parent_id: input.parentId ?? null
				})
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
		async setOrder(ids, expectedIds, parentId = null) {
			const { error } = await client.rpc('set_group_order', {
				p_organization_id: orgId,
				p_group_ids: [...ids],
				p_expected_group_ids: [...expectedIds],
				p_parent_id: parentId ?? undefined
			});
			if (error) throwGroupCommandError(error);
		},
		async move(id, parentId) {
			let siblings = client
				.from('groups')
				.select('id, sort_order')
				.eq('organization_id', orgId)
				.order('sort_order', { ascending: false })
				.limit(2);
			siblings = parentId ? siblings.eq('parent_id', parentId) : siblings.is('parent_id', null);
			const last = await siblings.returns<{ id: string; sort_order: number }[]>();
			if (last.error) throwGroupWriteError(last.error);
			const lastSortOrder = last.data.find((row) => row.id !== id)?.sort_order ?? -1;
			const { data, error } = await client
				.from('groups')
				.update({ parent_id: parentId, sort_order: lastSortOrder + 1 })
				.eq('organization_id', orgId)
				.eq('id', id)
				.select('*')
				.returns<Record<string, unknown>[]>();
			if (error) throwGroupWriteError(error);
			if (!data[0]) fail(404, GROUP_UNAVAILABLE_MESSAGE);
			return toGroup(data[0]);
		},
		async countActiveMembers() {
			const ids = visibleGroupIds(scopeSet);
			if (ids?.length === 0) return new Map();
			const result = await selectAllSupabaseRows<{ id: string; group_id: string }>(async (from, to) => {
				let query = client
					.from('personnel')
					.select('id, group_id')
					.eq('organization_id', orgId)
					.is('archived_at', null)
					.not('group_id', 'is', null);
				if (ids) query = query.in('group_id', ids);
				const { data, error } = await query
					.order('id', { ascending: true })
					.range(from, to)
					.returns<{ id: string; group_id: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			const counts = new Map<string, number>();
			for (const row of result.data ?? []) counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
			return counts;
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
