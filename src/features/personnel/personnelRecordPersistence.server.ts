import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { PersonnelLifecycleReference, PersonnelRecordPersistence } from './contracts';
import {
	PERSONNEL_FIELDS,
	toPersonnel,
	personnelEditableRow,
	personnelInsertRow,
	throwPersonnelMutationError
} from './personnelPersistenceMapping.server';

const LIFECYCLE_FIELDS = 'rank, first_name, last_name, group_id, archived_at';
function lifecycle(row: Record<string, unknown>): PersonnelLifecycleReference {
	return {
		rank: row.rank as string,
		firstName: row.first_name as string,
		lastName: row.last_name as string,
		groupId: (row.group_id as string | null) ?? null,
		archivedAt: (row.archived_at as string | null) ?? null
	};
}
export function createSupabasePersonnelRecordPersistence(
	client: SupabaseClient,
	orgId: string,
	scope?: ScopeSet
): PersonnelRecordPersistence {
	const groupIds = scope?.kind === 'groups' ? [...new Set(scope.groupIds.filter(Boolean))] : null;
	function read(select: string) {
		const query = client.from('personnel').select(select).eq('organization_id', orgId);
		return groupIds ? query.in('group_id', groupIds) : query;
	}
	async function find(select: string, field: 'id' | 'slug', value: string) {
		if (groupIds?.length === 0) return null;
		const { data, error } = await read(select).eq(field, value).limit(1).maybeSingle<Record<string, unknown>>();
		if (error) throw new Error(error.message);
		return data;
	}
	async function list(select: string, options: { ids?: string[]; prefix?: string; active?: boolean } = {}) {
		if (groupIds?.length === 0 || options.ids?.length === 0) return [];
		const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
			let query = read(select);
			if (options.ids) query = query.in('id', [...new Set(options.ids)]);
			if (options.prefix !== undefined) query = query.ilike('slug', `${options.prefix}%`);
			if (options.active) query = query.is('archived_at', null);
			const { data, error } = await query
				.order('id', { ascending: true })
				.range(from, to)
				.returns<Record<string, unknown>[]>();
			return { data, error };
		});
		if (result.error) throw new Error((result.error as { message: string }).message);
		return result.data ?? [];
	}
	return {
		async findBySlug(slug) {
			const row = await find(PERSONNEL_FIELDS, 'slug', slug);
			return row ? toPersonnel(row) : null;
		},
		async findById(id) {
			const row = await find(PERSONNEL_FIELDS, 'id', id);
			return row ? toPersonnel(row) : null;
		},
		async findWriteReference(id) {
			const row = await find(LIFECYCLE_FIELDS, 'id', id);
			return row ? lifecycle(row) : null;
		},
		async findGroupReference(id) {
			const row = await find('group_id', 'id', id);
			return row ? { groupId: (row.group_id as string | null) ?? null } : null;
		},
		async listArchiveCandidates(ids) {
			return (await list(`id, ${LIFECYCLE_FIELDS}`, { ids })).map((row) => ({
				id: row.id as string,
				...lifecycle(row)
			}));
		},
		async listImportSlugs() {
			return (await list('slug')).map((row) => ({ slug: (row.slug as string | null) ?? null }));
		},
		async listSlugCandidates(prefix) {
			return (await list('id, slug', { prefix })).map((row) => ({
				id: row.id as string,
				slug: (row.slug as string | null) ?? null
			}));
		},
		async listBackfillCandidates() {
			return (await list('id, rank, first_name, last_name, group_id, ets, deros', { active: true })).map((row) => ({
				id: row.id as string,
				rank: row.rank as string,
				firstName: row.first_name as string,
				lastName: row.last_name as string,
				groupId: (row.group_id as string | null) ?? null,
				ets: (row.ets as string | null) ?? null,
				deros: (row.deros as string | null) ?? null
			}));
		},
		async listRankReferences() {
			return (await list('rank')).map((row) => ({ rank: row.rank as string | null | undefined }));
		},
		async findDisplayNamesByIds(ids) {
			return new Map(
				(await list('id, rank, last_name', { ids })).map((row) => [row.id as string, `${row.rank} ${row.last_name}`])
			);
		},
		async create(input) {
			const { data, error } = await client
				.from('personnel')
				.insert(personnelInsertRow(input, orgId))
				.select(PERSONNEL_FIELDS)
				.single<Record<string, unknown>>();
			if (error) throwPersonnelMutationError(error);
			return toPersonnel(data);
		},
		async createMany(inputs) {
			if (inputs.length === 0) return [];
			const { data, error } = await client
				.from('personnel')
				.insert(inputs.map((input) => personnelInsertRow(input, orgId)))
				.select(PERSONNEL_FIELDS)
				.returns<Record<string, unknown>[]>();
			if (error) throwPersonnelMutationError(error);
			return (data ?? []).map(toPersonnel);
		},
		async updateEditable(id, patch, options) {
			let query = client
				.from('personnel')
				.update(personnelEditableRow(patch))
				.eq('organization_id', orgId)
				.eq('id', id);
			if (options?.onlyActive) query = query.is('archived_at', null);
			const { data, error } = await query.select(PERSONNEL_FIELDS).maybeSingle<Record<string, unknown>>();
			if (error) throwPersonnelMutationError(error);
			return data ? toPersonnel(data) : null;
		},
		async updateDates(id, patch) {
			const { data, error } = await client
				.from('personnel')
				.update({ ets: patch.ets, deros: patch.deros })
				.eq('organization_id', orgId)
				.eq('id', id)
				.select('*')
				.single<Record<string, unknown>>();
			if (error) throwPersonnelMutationError(error);
			return toPersonnel(data);
		},
		async moveToGroup(ids, groupId) {
			if (ids.length === 0) return [];
			const { data, error } = await client
				.from('personnel')
				.update({ group_id: groupId })
				.eq('organization_id', orgId)
				.in('id', [...new Set(ids)])
				.is('archived_at', null)
				.select('id')
				.returns<{ id: string }[]>();
			if (error) throwPersonnelMutationError(error);
			return (data ?? []).map((row) => row.id);
		},
		async delete(id) {
			const { error } = await client.from('personnel').delete().eq('organization_id', orgId).eq('id', id);
			if (error?.code === '23503' && error.message.includes('calendar_tasking_participants_personnel_fkey'))
				fail(409, 'This person was just picked for a tasking. Remove them from it before deleting.');
			if (error) throwPersonnelMutationError(error);
		}
	};
}
