import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { CriticalTaskCompletionPersistence, PersonnelIctCompletion } from '../contracts';
import {
	COMPLETION_SELECT,
	completionCreateValues,
	completionPatchValues,
	mapPersonnelIctCompletion,
	type SavedPersonnelIctCompletion
} from './personnelIctCompletionMapping.server';

export function createSupabaseCriticalTaskCompletionPersistence(
	client: SupabaseClient,
	orgId: string
): CriticalTaskCompletionPersistence {
	async function listRows(input: {
		personnelId?: string;
		personnelIds?: string[];
		taskIds?: string[];
		order?: 'history' | 'report';
	}) {
		const { data, error } = await selectAllSupabaseRows<SavedPersonnelIctCompletion>(async (from, to) => {
			let query = client.from('personnel_ict_completions').select(COMPLETION_SELECT).eq('organization_id', orgId);
			if (input.personnelId !== undefined) query = query.eq('personnel_id', input.personnelId);
			if (input.personnelIds) query = query.in('personnel_id', input.personnelIds);
			if (input.taskIds) query = query.in('ict_task_id', input.taskIds);
			if (input.order === 'history') query = query.order('completed_at', { ascending: false }).order('id');
			if (input.order === 'report') query = query.order('id');
			return query.range(from, to);
		});
		if (error) throw new Error((error as { message: string }).message);
		return (data ?? []).map(mapPersonnelIctCompletion);
	}

	return {
		listHistory(personnelId) {
			return listRows({ personnelId, order: 'history' });
		},
		listReadinessHistory(personnelId) {
			return listRows({ personnelId });
		},
		async listReportHistory({ personnelIds, taskIds }) {
			const people = [...new Set(personnelIds)];
			const tasks = [...new Set(taskIds)];
			const completions: PersonnelIctCompletion[] = [];
			let pending: Array<Promise<PersonnelIctCompletion[]>> = [];
			for (let personIndex = 0; personIndex < people.length; personIndex += 50) {
				for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 50) {
					pending.push(
						listRows({
							personnelIds: people.slice(personIndex, personIndex + 50),
							taskIds: tasks.slice(taskIndex, taskIndex + 50),
							order: 'report'
						})
					);
					if (pending.length === 4) {
						for (const rows of await Promise.all(pending)) {
							for (const row of rows) completions.push(row);
						}
						pending = [];
					}
				}
			}
			for (const rows of await Promise.all(pending)) {
				for (const row of rows) completions.push(row);
			}
			return completions;
		},
		async listImportHistory(pairs) {
			const uniquePairs = [...new Map(pairs.map((pair) => [`${pair.personnelId}:${pair.ictTaskId}`, pair])).values()];
			const pending: Array<Promise<PersonnelIctCompletion[]>> = [];
			for (let index = 0; index < uniquePairs.length; index += 50) {
				const batch = uniquePairs.slice(index, index + 50);
				pending.push(
					listRows({
						personnelIds: [...new Set(batch.map((pair) => pair.personnelId))],
						taskIds: [...new Set(batch.map((pair) => pair.ictTaskId))]
					})
				);
			}
			return [
				...new Map((await Promise.all(pending)).flat().map((completion) => [completion.id, completion])).values()
			];
		},
		async findReference(id) {
			const { data, error } = await client
				.from('personnel_ict_completions')
				.select('id,personnel_id,ict_task_id')
				.eq('organization_id', orgId)
				.eq('id', id)
				.single();
			if (error) {
				if (error.code === 'PGRST116') return null;
				throw new Error(error.message);
			}
			return data ? { id: data.id, personnelId: data.personnel_id, ictTaskId: data.ict_task_id } : null;
		},
		async create(input) {
			const { data, error } = await client
				.from('personnel_ict_completions')
				.insert({ ...completionCreateValues(input), organization_id: orgId })
				.select(COMPLETION_SELECT)
				.single();
			if (error) throw new Error(error.message);
			return mapPersonnelIctCompletion(data as SavedPersonnelIctCompletion);
		},
		async createMany(inputs) {
			if (inputs.length === 0) return [];
			const { data, error } = await client
				.from('personnel_ict_completions')
				.insert(inputs.map((input) => ({ ...completionCreateValues(input), organization_id: orgId })))
				.select(COMPLETION_SELECT);
			if (error) throw new Error(error.message);
			return ((data ?? []) as SavedPersonnelIctCompletion[]).map(mapPersonnelIctCompletion);
		},
		async update(id, patch) {
			const { data, error } = await client
				.from('personnel_ict_completions')
				.update(completionPatchValues(patch))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(COMPLETION_SELECT)
				.single();
			if (error) throw new Error(error.message);
			return mapPersonnelIctCompletion(data as SavedPersonnelIctCompletion);
		},
		async delete(id) {
			const { error } = await client
				.from('personnel_ict_completions')
				.delete()
				.eq('organization_id', orgId)
				.eq('id', id);
			if (error) throw new Error(error.message);
		}
	};
}
