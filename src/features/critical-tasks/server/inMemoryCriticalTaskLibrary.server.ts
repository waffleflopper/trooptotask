import { fail } from '$lib/errors';
import type { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import {
	ICT_TASK_ORDER_CHANGED_MESSAGE,
	ICT_TASK_UNAVAILABLE_MESSAGE,
	type CriticalTaskLibraryPersistence
} from '../contracts';
import { mapIctTask, taskCreateValues, taskPatchValues, type SavedIctTask } from './ictTaskMapping.server';

type TaskMemoryStore = Pick<
	ReturnType<typeof createInMemoryDataStore>,
	'findOne' | 'findMany' | 'insert' | 'insertMany' | 'update' | 'compareAndUpdateMany'
>;

export function createInMemoryCriticalTaskLibraryPersistence(
	store: TaskMemoryStore,
	orgId: string
): CriticalTaskLibraryPersistence {
	const ordered = [
		{ column: 'sort_order', ascending: true },
		{ column: 'task_code', ascending: true }
	];
	return {
		async listCatalog(options = {}) {
			const rows = await store.findMany<SavedIctTask>('ict_tasks', orgId, undefined, {
				...(options.includeArchived ? {} : { isNull: { archived_at: true } }),
				orderBy: ordered
			});
			return rows.map(mapIctTask);
		},
		async listImportCandidates() {
			return (await store.findMany<SavedIctTask>('ict_tasks', orgId)).map(mapIctTask);
		},
		async listReferenced(ids) {
			if (ids.length === 0) return [];
			return (
				await store.findMany<SavedIctTask>('ict_tasks', orgId, undefined, {
					inFilters: { id: [...new Set(ids)] },
					orderBy: ordered
				})
			).map(mapIctTask);
		},
		async findReference(id) {
			const row = await store.findOne<SavedIctTask>('ict_tasks', orgId, { id });
			return row ? { id: row.id, archivedAt: row.archived_at } : null;
		},
		async create(input) {
			return mapIctTask(await store.insert<SavedIctTask>('ict_tasks', orgId, taskCreateValues(input)));
		},
		async createMany(inputs) {
			return (await store.insertMany<SavedIctTask>('ict_tasks', orgId, inputs.map(taskCreateValues))).map(mapIctTask);
		},
		async update(id, patch) {
			if (!(await store.findOne('ict_tasks', orgId, { id }))) return null;
			return mapIctTask(await store.update<SavedIctTask>('ict_tasks', orgId, id, taskPatchValues(patch)));
		},
		async reorder(changes) {
			const result = await store.compareAndUpdateMany<SavedIctTask>(
				'ict_tasks',
				orgId,
				changes.map((change) => ({
					id: change.id,
					expected: { sort_order: change.expectedSortOrder },
					patch: change.sortOrder === change.expectedSortOrder ? {} : { sort_order: change.sortOrder }
				})),
				{ isNull: { archived_at: true } }
			);
			if (result.status === 'updated') return structuredClone(result.rows).map(mapIctTask);
			return result.status === 'missing'
				? fail(404, ICT_TASK_UNAVAILABLE_MESSAGE)
				: fail(409, ICT_TASK_ORDER_CHANGED_MESSAGE);
		}
	};
}
