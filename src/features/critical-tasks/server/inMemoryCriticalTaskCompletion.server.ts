import type { DataStore } from '$lib/server/core/ports';
import type { CriticalTaskCompletionPersistence } from '../contracts';
import {
	completionCreateValues,
	completionPatchValues,
	mapPersonnelIctCompletion,
	type SavedPersonnelIctCompletion
} from './personnelIctCompletionMapping.server';

export function createInMemoryCriticalTaskCompletionPersistence(
	store: Pick<DataStore, 'findOne' | 'findMany' | 'insert' | 'insertMany' | 'update' | 'delete'>,
	orgId: string
): CriticalTaskCompletionPersistence {
	return {
		async listHistory(personnelId) {
			return (
				await store.findMany<SavedPersonnelIctCompletion>(
					'personnel_ict_completions',
					orgId,
					{ personnel_id: personnelId },
					{
						orderBy: [
							{ column: 'completed_at', ascending: false },
							{ column: 'id', ascending: true }
						]
					}
				)
			).map(mapPersonnelIctCompletion);
		},
		async listReadinessHistory(personnelId) {
			return (
				await store.findMany<SavedPersonnelIctCompletion>('personnel_ict_completions', orgId, {
					personnel_id: personnelId
				})
			).map(mapPersonnelIctCompletion);
		},
		async listReportHistory({ personnelIds, taskIds }) {
			if (personnelIds.length === 0 || taskIds.length === 0) return [];
			return (
				await store.findMany<SavedPersonnelIctCompletion>('personnel_ict_completions', orgId, undefined, {
					inFilters: { personnel_id: [...new Set(personnelIds)], ict_task_id: [...new Set(taskIds)] },
					orderBy: [{ column: 'id', ascending: true }]
				})
			).map(mapPersonnelIctCompletion);
		},
		async listImportHistory(pairs) {
			const uniquePairs = [...new Map(pairs.map((pair) => [`${pair.personnelId}:${pair.ictTaskId}`, pair])).values()];
			const pending: Array<Promise<SavedPersonnelIctCompletion[]>> = [];
			for (let index = 0; index < uniquePairs.length; index += 50) {
				const batch = uniquePairs.slice(index, index + 50);
				pending.push(
					store.findMany<SavedPersonnelIctCompletion>('personnel_ict_completions', orgId, undefined, {
						inFilters: {
							personnel_id: [...new Set(batch.map((pair) => pair.personnelId))],
							ict_task_id: [...new Set(batch.map((pair) => pair.ictTaskId))]
						}
					})
				);
			}
			return [...new Map((await Promise.all(pending)).flat().map((row) => [row.id, row])).values()].map(
				mapPersonnelIctCompletion
			);
		},
		async findReference(id) {
			const row = await store.findOne<SavedPersonnelIctCompletion>('personnel_ict_completions', orgId, { id });
			return row ? { id: row.id, personnelId: row.personnel_id, ictTaskId: row.ict_task_id } : null;
		},
		async create(input) {
			return mapPersonnelIctCompletion(
				await store.insert<SavedPersonnelIctCompletion>(
					'personnel_ict_completions',
					orgId,
					completionCreateValues(input)
				)
			);
		},
		async createMany(inputs) {
			if (inputs.length === 0) return [];
			return (
				await store.insertMany<SavedPersonnelIctCompletion>(
					'personnel_ict_completions',
					orgId,
					inputs.map(completionCreateValues)
				)
			).map(mapPersonnelIctCompletion);
		},
		async update(id, patch) {
			return mapPersonnelIctCompletion(
				await store.update<SavedPersonnelIctCompletion>(
					'personnel_ict_completions',
					orgId,
					id,
					completionPatchValues(patch)
				)
			);
		},
		delete(id) {
			return store.delete('personnel_ict_completions', orgId, id);
		}
	};
}
