import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import {
	ICT_COMPLETION_EXISTS_MESSAGE,
	personnelIctCompletionSchema,
	type CriticalTaskCompletionPersistence,
	type PersonnelIctCompletion
} from '../contracts';
import {
	acknowledgedRows,
	confirmInsertedRows,
	isUnknownWriteStatus,
	writeUnconfirmed
} from './criticalTaskWriteOutcome.server';
import {
	COMPLETION_SELECT,
	completionCreateValues,
	completionPatchValues,
	mapPersonnelIctCompletion,
	type SavedPersonnelIctCompletion
} from './personnelIctCompletionMapping.server';

function throwWriteError(error: { code?: string; message: string }): never {
	if (error.code === '23505' && error.message.includes('"personnel_ict_completions_org_person_task_date_key"')) {
		fail(409, ICT_COMPLETION_EXISTS_MESSAGE);
	}
	throw new Error(error.message);
}

export function createSupabaseCriticalTaskCompletionPersistence(
	client: SupabaseClient,
	orgId: string
): CriticalTaskCompletionPersistence {
	async function listRows(input: {
		personnelId?: string;
		personnelIds?: string[];
		taskIds?: string[];
		ids?: string[];
		order?: 'history';
	}) {
		const { data, error } = await selectAllSupabaseRows<SavedPersonnelIctCompletion>(async (from, to) => {
			let query = client.from('personnel_ict_completions').select(COMPLETION_SELECT).eq('organization_id', orgId);
			if (input.personnelId !== undefined) query = query.eq('personnel_id', input.personnelId);
			if (input.personnelIds) query = query.in('personnel_id', input.personnelIds);
			if (input.taskIds) query = query.in('ict_task_id', input.taskIds);
			if (input.ids) query = query.in('id', input.ids);
			if (input.order === 'history') query = query.order('completed_at', { ascending: false });
			query = query.order('id');
			return query.range(from, to);
		});
		if (error) throw new Error((error as { message: string }).message);
		return (data ?? []).map(mapPersonnelIctCompletion);
	}

	function listByIds(ids: string[]) {
		return listRows({ ids });
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
							taskIds: tasks.slice(taskIndex, taskIndex + 50)
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
			const row = { ...completionCreateValues(input), id: crypto.randomUUID(), organization_id: orgId };
			const { data, error, status } = await client
				.from('personnel_ict_completions')
				.insert(row)
				.select(COMPLETION_SELECT)
				.single();
			if (error && !isUnknownWriteStatus(status)) throwWriteError(error);
			const acknowledged = error
				? null
				: acknowledgedRows([data], [row.id], mapPersonnelIctCompletion, personnelIctCompletionSchema);
			if (acknowledged) return acknowledged[0];
			return (await confirmInsertedRows([row.id], listByIds, personnelIctCompletionSchema))[0];
		},
		async createMany(inputs) {
			if (inputs.length === 0) return [];
			const rows = inputs.map((input) => ({
				...completionCreateValues(input),
				id: crypto.randomUUID(),
				organization_id: orgId
			}));
			const ids = rows.map((row) => row.id);
			const { data, error, status } = await client
				.from('personnel_ict_completions')
				.insert(rows)
				.select(COMPLETION_SELECT);
			if (error && !isUnknownWriteStatus(status)) throwWriteError(error);
			const acknowledged = error
				? null
				: acknowledgedRows(data, ids, mapPersonnelIctCompletion, personnelIctCompletionSchema);
			if (acknowledged) return acknowledged;
			return confirmInsertedRows(ids, listByIds, personnelIctCompletionSchema);
		},
		async update(id, patch) {
			const { data, error, status } = await client
				.from('personnel_ict_completions')
				.update(completionPatchValues(patch))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(COMPLETION_SELECT)
				.single();
			if (error) {
				if (isUnknownWriteStatus(status)) writeUnconfirmed();
				throwWriteError(error);
			}
			const acknowledged = acknowledgedRows([data], [id], mapPersonnelIctCompletion, personnelIctCompletionSchema);
			if (!acknowledged) writeUnconfirmed();
			return acknowledged[0];
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
