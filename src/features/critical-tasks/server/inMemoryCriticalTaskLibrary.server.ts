import type { CriticalTaskLibraryPersistence } from '../contracts';
import { mapIctTask, taskCreateValues, taskPatchValues, type SavedIctTask } from './ictTaskMapping.server';

interface TaskMemoryStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>): Promise<T | null>;
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: {
			isNull?: Record<string, boolean>;
			inFilters?: Record<string, string[]>;
			orderBy?: Array<{ column: string; ascending: boolean }>;
		}
	): Promise<T[]>;
	insert<T>(table: string, orgId: string, input: Record<string, unknown>): Promise<T>;
	insertMany<T>(table: string, orgId: string, inputs: Record<string, unknown>[]): Promise<T[]>;
	update<T>(table: string, orgId: string, id: string, patch: Record<string, unknown>): Promise<T>;
}

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
			return mapIctTask(await store.update<SavedIctTask>('ict_tasks', orgId, id, taskPatchValues(patch)));
		}
	};
}
