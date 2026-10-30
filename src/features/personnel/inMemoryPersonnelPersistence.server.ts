import { fail } from '$lib/errors';
interface PersonnelMemoryReadOptions {
	select?: string;
	inFilters?: Record<string, unknown[]>;
	ilikeFilters?: Record<string, string>;
	isNull?: Record<string, boolean>;
	orderBy?: Array<{ column: string; ascending: boolean }>;
	limit?: number;
}

export interface PersonnelMemoryStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: PersonnelMemoryReadOptions
	): Promise<T[]>;
	findManyWithCount<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: PersonnelMemoryReadOptions
	): Promise<{ data: T[]; count: number | null }>;
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	insertMany<T>(table: string, orgId: string, data: Record<string, unknown>[], select?: string): Promise<T[]>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
	deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void>;
}

import {
	GROUP_NAME_EXISTS_MESSAGE,
	GROUP_ORDER_CHANGED_MESSAGE,
	GROUP_PARENT_GONE_MESSAGE,
	GROUP_UNAVAILABLE_MESSAGE,
	type PersonnelRecordPersistence,
	type PersonnelRosterReader,
	type GroupPersistence,
	type SelfPinPersistence
} from './contracts';
import {
	LOSS_CANDIDATE_FIELDS,
	PERSONNEL_FIELDS,
	toLossCandidate,
	toPersonnel,
	type LossCandidateRow,
	personnelEditableRow,
	personnelInsertRow
} from './personnelPersistenceMapping.server';
import type { GroupCoverage } from '$lib/access/memberAccessShape';
import { visibleGroupIds } from './groupCatalog.server';

export function createInMemoryPersonnelRecordPersistence(
	store: PersonnelMemoryStore,
	orgId: string
): PersonnelRecordPersistence {
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
		async findDisplayNamesByIds(ids) {
			if (!ids.length) return new Map();
			const rows = await store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
				select: 'id, rank, last_name',
				inFilters: { id: [...new Set(ids)] }
			});
			return new Map(rows.map((row) => [row.id as string, `${row.rank} ${row.last_name}`]));
		},
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
		async updateEditable(id, patch, options) {
			const person = await store.findOne<{ archived_at?: string | null }>('personnel', orgId, { id });
			if (!person || (options?.onlyActive && person.archived_at != null)) {
				return null;
			}
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
		async moveToGroup(ids, groupId) {
			const rows = await store.findMany<{ id: string }>('personnel', orgId, undefined, {
				select: 'id',
				inFilters: { id: [...new Set(ids)] },
				isNull: { archived_at: true }
			});
			for (const row of rows) await store.update('personnel', orgId, row.id, { group_id: groupId });
			return rows.map((row) => row.id);
		},
		delete: (id) => store.delete('personnel', orgId, id)
	};
}
export function createInMemoryPersonnelRosterReader(store: PersonnelMemoryStore, orgId: string): PersonnelRosterReader {
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
		},
		async findOldestArchivedAt() {
			const [oldest] = await store.findMany<{ archived_at: string }>('personnel', orgId, undefined, {
				select: 'archived_at',
				isNull: { archived_at: false },
				orderBy: [{ column: 'archived_at', ascending: true }],
				limit: 1
			});
			return oldest?.archived_at ?? null;
		},
		async listLossCandidates() {
			const rows = await store.findMany<LossCandidateRow>('personnel', orgId, undefined, {
				select: LOSS_CANDIDATE_FIELDS,
				isNull: { archived_at: true },
				orderBy: [{ column: 'id', ascending: true }]
			});
			return rows.filter((row) => row.ets || row.deros).map(toLossCandidate);
		}
	};
}
export function createInMemoryGroupPersistence(
	store: PersonnelMemoryStore,
	orgId: string,
	scopeSet: GroupCoverage
): GroupPersistence {
	const map = (row: Record<string, unknown>) => ({
		id: row.id as string,
		name: row.name as string,
		sortOrder: row.sort_order as number,
		parentId: (row.parent_id as string | null) ?? null,
		depth: (row.depth ?? 1) as 1 | 2 | 3
	});
	async function rows(select: string, requestedIds?: string[]) {
		const ids = visibleGroupIds(scopeSet, requestedIds);
		if (ids?.length === 0) return [];
		return store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			select,
			inFilters: ids ? { id: ids } : undefined,
			orderBy: [
				{ column: 'sort_order', ascending: true },
				{ column: 'name', ascending: true },
				{ column: 'id', ascending: true }
			]
		});
	}
	return {
		async listCatalog() {
			return (await rows('*')).map(map);
		},
		async findReference(id) {
			const [row] = await rows('id', [id]);
			return row ? { id: row.id as string } : null;
		},
		async create(input) {
			const parentId = input.parentId ?? null;
			if ((await rows('*')).some((group) => (group.parent_id ?? null) === parentId && group.name === input.name))
				fail(409, GROUP_NAME_EXISTS_MESSAGE);
			const parent = parentId ? await store.findOne<Record<string, unknown>>('groups', orgId, { id: parentId }) : null;
			if (parentId && !parent) fail(404, GROUP_UNAVAILABLE_MESSAGE);
			const depth = parent ? Number(parent.depth ?? 1) + 1 : 1;
			if (depth > 3) fail(400, 'Invalid Group change');
			return map(
				await store.insert('groups', orgId, {
					name: input.name,
					sort_order: input.sortOrder ?? 0,
					parent_id: parentId,
					depth
				})
			);
		},
		async rename(id, name) {
			const group = await store.findOne<Record<string, unknown>>('groups', orgId, { id });
			if (!group) fail(404, GROUP_UNAVAILABLE_MESSAGE);
			if (group.name === name) return map(group);
			if (
				(await rows('*')).some(
					(other) => (other.parent_id ?? null) === (group.parent_id ?? null) && other.name === name
				)
			)
				fail(409, GROUP_NAME_EXISTS_MESSAGE);
			return map(await store.update('groups', orgId, id, { name }));
		},
		async setOrder(ids, expectedIds, parentId = null) {
			const saved = (await rows('id, parent_id'))
				.filter((row) => (row.parent_id ?? null) === parentId)
				.map((row) => row.id as string);
			if (saved.join() === ids.join()) return;
			if (saved.join() !== expectedIds.join()) fail(409, GROUP_ORDER_CHANGED_MESSAGE);
			if (ids.length !== saved.length || saved.some((id) => !ids.includes(id))) fail(400, 'Choose every Group once');
			for (const [index, id] of ids.entries()) await store.update('groups', orgId, id, { sort_order: index });
		},
		async move(id, parentId) {
			const catalog = (await rows('*')).map(map);
			const group = catalog.find((candidate) => candidate.id === id);
			if (!group) fail(404, GROUP_UNAVAILABLE_MESSAGE);
			const parent = parentId ? catalog.find((candidate) => candidate.id === parentId) : null;
			if (parentId && !parent) fail(400, GROUP_PARENT_GONE_MESSAGE);
			const subtree = new Set([id]);
			for (let pass = 1; pass < 3; pass++) {
				for (const other of catalog) if (other.parentId && subtree.has(other.parentId)) subtree.add(other.id);
			}
			if (parentId && subtree.has(parentId)) fail(400, 'A Group cannot move under one of its own sub-groups.');
			const depth = parent ? parent.depth + 1 : 1;
			const height =
				Math.max(...catalog.filter((other) => subtree.has(other.id)).map((other) => other.depth)) - group.depth;
			if (depth + height > 3) fail(400, 'Groups can nest at most three levels deep.');
			const siblings = catalog.filter((other) => other.parentId === parentId && other.id !== id);
			if (siblings.some((other) => other.name === group.name)) fail(409, GROUP_NAME_EXISTS_MESSAGE);
			const moved = await store.update<Record<string, unknown>>('groups', orgId, id, {
				parent_id: parentId,
				sort_order: Math.max(-1, ...siblings.map((other) => other.sortOrder)) + 1,
				depth
			});
			for (const other of catalog) {
				if (other.id !== id && subtree.has(other.id))
					await store.update('groups', orgId, other.id, { depth: other.depth + depth - group.depth });
			}
			return map(moved);
		},
		async countActiveMembers() {
			const ids = visibleGroupIds(scopeSet);
			const people = await store.findMany<{ group_id: string | null; archived_at: string | null }>('personnel', orgId);
			const counts = new Map<string, number>();
			for (const person of people) {
				if (!person.group_id || person.archived_at || (ids && !ids.includes(person.group_id))) continue;
				counts.set(person.group_id, (counts.get(person.group_id) ?? 0) + 1);
			}
			return counts;
		},
		async countArchivedMembers(groupIds) {
			const people = await store.findMany<{ group_id: string | null; archived_at: string | null }>('personnel', orgId);
			return people.filter((person) => person.archived_at && person.group_id && groupIds.includes(person.group_id))
				.length;
		},
		async deleteWithReassignment(id, targetId) {
			const group = await store.findOne('groups', orgId, { id });
			if (!group || (targetId && !(await store.findOne('groups', orgId, { id: targetId }))))
				fail(404, GROUP_UNAVAILABLE_MESSAGE);
			const catalog = (await rows('*')).map(map);
			const subtree = new Set([id]);
			for (let depth = 1; depth < 3; depth++) {
				for (const group of catalog) if (group.parentId && subtree.has(group.parentId)) subtree.add(group.id);
			}
			if (targetId && subtree.has(targetId)) fail(400, 'Choose another Group for the members');
			const members = await store.findMany<{ id: string }>('personnel', orgId, undefined, {
				inFilters: { group_id: [...subtree] }
			});
			for (const member of members) await store.update('personnel', orgId, member.id, { group_id: targetId });
			for (const group of catalog.filter((group) => subtree.has(group.id)).sort((a, b) => b.depth - a.depth)) {
				await store.delete('groups', orgId, group.id);
				await store.deleteWhere('user_pinned_groups', orgId, { group_id: group.id });
			}
			return members.length;
		}
	};
}
export function createInMemorySelfPinPersistence(
	store: PersonnelMemoryStore,
	orgId: string,
	userId: string
): SelfPinPersistence {
	return {
		async listGroupIds() {
			return (
				await store.findMany<{ group_id: string }>(
					'user_pinned_groups',
					orgId,
					{ user_id: userId },
					{
						select: 'group_id',
						orderBy: [
							{ column: 'sort_order', ascending: true },
							{ column: 'id', ascending: true }
						]
					}
				)
			).map((row) => row.group_id);
		},
		async insert(input) {
			const row = await store.insert<{ id: string; group_id: string; sort_order: number }>(
				'user_pinned_groups',
				orgId,
				{ user_id: userId, group_id: input.groupId, sort_order: input.sortOrder ?? 0 }
			);
			return { id: row.id, groupId: row.group_id, sortOrder: row.sort_order };
		},
		async remove(groupId) {
			await store.deleteWhere('user_pinned_groups', orgId, { user_id: userId, group_id: groupId });
		}
	};
}
