import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { CriticalTaskLibraryPersistence, IctTask } from '../contracts';
import { mapIctTask, taskCreateValues, taskPatchValues, TASK_SELECT, type SavedIctTask } from './ictTaskMapping.server';

function throwWriteError(error: { code?: string; message: string }): never {
	if (error.code === '23505' && error.message.includes('"ict_tasks_organization_id_task_code_key"')) {
		fail(409, 'Task code already exists in this Organization');
	}
	throw new Error(error.message);
}

function acknowledgedTask(data: unknown, expectedId?: string): SavedIctTask {
	if (
		!data ||
		typeof data !== 'object' ||
		Array.isArray(data) ||
		!('id' in data) ||
		typeof data.id !== 'string' ||
		data.id.length === 0 ||
		(expectedId !== undefined && data.id !== expectedId)
	) {
		throw new Error('Critical task write returned an invalid acknowledgment');
	}
	return data as SavedIctTask;
}

export function createSupabaseCriticalTaskLibraryPersistence(
	client: SupabaseClient,
	orgId: string
): CriticalTaskLibraryPersistence {
	async function listRows(options: { includeArchived: boolean; ordered: boolean; ids?: string[] }) {
		const { data, error } = await selectAllSupabaseRows<SavedIctTask>(async (from, to) => {
			let query = client.from('ict_tasks').select(TASK_SELECT).eq('organization_id', orgId);
			if (!options.includeArchived) query = query.is('archived_at', null);
			if (options.ids) query = query.in('id', options.ids);
			if (options.ordered) query = query.order('sort_order').order('task_code');
			return query.range(from, to);
		});
		if (error) throw new Error((error as { message: string }).message);
		return (data ?? []).map(mapIctTask);
	}

	return {
		listCatalog(options = {}) {
			return listRows({ includeArchived: options.includeArchived ?? false, ordered: true });
		},
		listImportCandidates() {
			return listRows({ includeArchived: true, ordered: false });
		},
		async listReferenced(ids) {
			const uniqueIds = [...new Set(ids)];
			const tasks: IctTask[] = [];
			for (let index = 0; index < uniqueIds.length; index += 200) {
				const pending: Array<Promise<IctTask[]>> = [];
				for (let offset = index; offset < Math.min(index + 200, uniqueIds.length); offset += 50) {
					pending.push(listRows({ includeArchived: true, ordered: true, ids: uniqueIds.slice(offset, offset + 50) }));
				}
				tasks.push(...(await Promise.all(pending)).flat());
			}
			return tasks;
		},
		async findReference(id) {
			const { data, error } = await client
				.from('ict_tasks')
				.select('id,archived_at')
				.eq('organization_id', orgId)
				.eq('id', id)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? { id: data.id, archivedAt: data.archived_at } : null;
		},
		async create(input) {
			const { data, error } = await client
				.from('ict_tasks')
				.insert({ ...taskCreateValues(input), organization_id: orgId })
				.select(TASK_SELECT)
				.single();
			if (error) throwWriteError(error);
			return mapIctTask(acknowledgedTask(data));
		},
		async createMany(inputs) {
			if (inputs.length === 0) return [];
			const { data, error } = await client
				.from('ict_tasks')
				.insert(inputs.map((input) => ({ ...taskCreateValues(input), organization_id: orgId })))
				.select(TASK_SELECT);
			if (error) throwWriteError(error);
			if (!Array.isArray(data)) throw new Error('Critical task batch returned an invalid acknowledgment');
			return data.map((row) => mapIctTask(acknowledgedTask(row)));
		},
		async update(id, patch) {
			const { data, error } = await client
				.from('ict_tasks')
				.update(taskPatchValues(patch))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(TASK_SELECT)
				.single();
			if (error) throwWriteError(error);
			return mapIctTask(acknowledgedTask(data, id));
		}
	};
}
