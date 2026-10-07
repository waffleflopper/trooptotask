import type { DataStore } from '$lib/server/core/ports';
import type {
	PersonnelRecordPersistence,
	PersonnelRosterReader,
	GroupPersistence,
	SelfPinPersistence
} from './contracts';
import {
	PERSONNEL_FIELDS,
	toPersonnel,
	personnelEditableRow,
	personnelInsertRow
} from './personnelPersistenceMapping.server';

export function createInMemoryPersonnelRecordPersistence(store: DataStore, orgId: string): PersonnelRecordPersistence {
	async function find(select: string, filters: Record<string, unknown>) {
		return store.findOne<Record<string, unknown>>('personnel', orgId, filters, select);
	}
	const reference = (row: Record<string, unknown>) => ({
		rank: row.rank as string,
		firstName: row.first_name as string,
		lastName: row.last_name as string,
		groupId: (row.group_id as string | null) ?? null,
		archivedAt: (row.archived_at as string | null) ?? null
	});
	return {
		async findBySlug(slug) {
			const row = await find(PERSONNEL_FIELDS, { slug });
			return row ? toPersonnel(row) : null;
		},
		async findById(id) {
			const row = await find(PERSONNEL_FIELDS, { id });
			return row ? toPersonnel(row) : null;
		},
		async findWriteReference(id) {
			const row = await find('rank, first_name, last_name, group_id, archived_at', { id });
			return row ? reference(row) : null;
		},
		async findGroupReference(id) {
			const row = await find('group_id', { id });
			return row ? { groupId: (row.group_id as string | null) ?? null } : null;
		},
		async findArchiveEvent(id) {
			const row = await find('archived_at', { id });
			return row ? { archivedAt: (row.archived_at as string | null) ?? null } : null;
		},
		async listArchiveCandidates(ids) {
			if (!ids.length) return [];
			return (
				await store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
					select: 'id, rank, first_name, last_name, group_id, archived_at',
					inFilters: { id: [...new Set(ids)] }
				})
			).map((row) => ({ id: row.id as string, ...reference(row) }));
		},
		listImportSlugs: () => store.findMany('personnel', orgId, undefined, { select: 'slug' }),
		listSlugCandidates: (prefix) =>
			store.findMany('personnel', orgId, undefined, { select: 'id, slug', ilikeFilters: { slug: `${prefix}%` } }),
		async listBackfillCandidates() {
			return (
				await store.findMany<Record<string, unknown>>('personnel', orgId, undefined, { isNull: { archived_at: true } })
			).map((row) => ({
				id: row.id as string,
				rank: row.rank as string,
				firstName: row.first_name as string,
				lastName: row.last_name as string,
				groupId: (row.group_id as string | null) ?? null,
				ets: (row.ets as string | null) ?? null,
				deros: (row.deros as string | null) ?? null
			}));
		},
		listRankReferences: () => store.findMany('personnel', orgId, undefined, { select: 'rank' }),
		async create(input) {
			return toPersonnel(await store.insert('personnel', orgId, personnelInsertRow(input, orgId), PERSONNEL_FIELDS));
		},
		async createMany(inputs) {
			if (!inputs.length) return [];
			return (
				await store.insertMany<Record<string, unknown>>(
					'personnel',
					orgId,
					inputs.map((input) => personnelInsertRow(input, orgId)),
					PERSONNEL_FIELDS
				)
			).map(toPersonnel);
		},
		async updateEditable(id, patch) {
			return toPersonnel(
				await store.update(
					'personnel',
					orgId,
					id,
					Object.fromEntries(Object.entries(personnelEditableRow(patch)).filter(([, value]) => value !== undefined)),
					PERSONNEL_FIELDS
				)
			);
		},
		async updateDates(id, patch) {
			return toPersonnel(await store.update('personnel', orgId, id, patch));
		},
		async setArchivedAt(id, value) {
			await store.update('personnel', orgId, id, { archived_at: value });
		},
		delete: (id) => store.delete('personnel', orgId, id)
	};
}
export function createInMemoryPersonnelRosterReader(store: DataStore, orgId: string): PersonnelRosterReader {
	return {
		async list(options = {}) {
			const status = options.status ?? 'active';
			const rows = await store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
				select: PERSONNEL_FIELDS,
				isNull: status === 'all' ? undefined : { archived_at: status === 'active' },
				orderBy:
					options.order === 'archived-newest'
						? [
								{ column: 'archived_at', ascending: false },
								{ column: 'id', ascending: true }
							]
						: [
								{ column: 'last_name', ascending: true },
								{ column: 'first_name', ascending: true },
								{ column: 'id', ascending: true }
							]
			});
			return rows.map(toPersonnel);
		},
		async countArchived() {
			const { count } = await store.findManyWithCount('personnel', orgId, undefined, {
				select: 'id',
				isNull: { archived_at: false },
				limit: 0
			});
			return count ?? 0;
		}
	};
}
export function createInMemoryGroupPersistence(store: DataStore, orgId: string): GroupPersistence {
	const map = (row: Record<string, unknown>) => ({
		id: row.id as string,
		name: row.name as string,
		sortOrder: row.sort_order as number
	});
	return {
		async listCatalog(options = {}) {
			if (options.groupIds?.length === 0) return [];
			return (
				await store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
					select: '*',
					inFilters: options.groupIds ? { id: options.groupIds } : undefined,
					orderBy: [
						{ column: 'sort_order', ascending: true },
						{ column: 'id', ascending: true }
					]
				})
			).map(map);
		},
		findReference: (id) => store.findOne('groups', orgId, { id }, 'id'),
		async findNamesByIds(ids) {
			if (!ids.length) return new Map();
			const rows = await store.findMany<{ id: string; name?: string | null }>('groups', orgId, undefined, {
				select: 'id, name',
				inFilters: { id: ids }
			});
			return new Map(
				rows
					.filter((row): row is { id: string; name: string } => typeof row.name === 'string')
					.map((row) => [row.id, row.name])
			);
		},
		async create(input) {
			return map(await store.insert('groups', orgId, { name: input.name, sort_order: input.sortOrder ?? 0 }));
		},
		async update(id, patch) {
			return map(
				await store.update(
					'groups',
					orgId,
					id,
					Object.fromEntries(
						Object.entries({ name: patch.name, sort_order: patch.sortOrder }).filter(([, value]) => value !== undefined)
					)
				)
			);
		},
		delete: (id) => store.delete('groups', orgId, id)
	};
}
export function createInMemorySelfPinPersistence(store: DataStore, orgId: string, userId: string): SelfPinPersistence {
	return {
		async listNames() {
			return (
				await store.findMany<{ group_name: string }>(
					'user_pinned_groups',
					orgId,
					{ user_id: userId },
					{
						select: 'group_name',
						orderBy: [
							{ column: 'sort_order', ascending: true },
							{ column: 'id', ascending: true }
						]
					}
				)
			).map((row) => row.group_name);
		},
		async insert(input) {
			const row = await store.insert<{ id: string; group_name: string; sort_order: number }>(
				'user_pinned_groups',
				orgId,
				{ user_id: userId, group_name: input.groupName, sort_order: input.sortOrder ?? 0 }
			);
			return { id: row.id, groupName: row.group_name, sortOrder: row.sort_order };
		},
		removeName: (groupName) =>
			store.deleteWhere('user_pinned_groups', orgId, { user_id: userId, group_name: groupName }),
		async replaceNames(names) {
			await store.deleteWhere('user_pinned_groups', orgId, { user_id: userId });
			if (names.length)
				await store.insertMany(
					'user_pinned_groups',
					orgId,
					names.map((groupName, sortOrder) => ({ user_id: userId, group_name: groupName, sort_order: sortOrder }))
				);
		}
	};
}
