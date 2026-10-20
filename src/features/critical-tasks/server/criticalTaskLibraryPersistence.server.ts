import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import {
	ICT_TASK_CODE_EXISTS_MESSAGE,
	ICT_TASK_ORDER_CHANGED_MESSAGE,
	ICT_TASK_UNAVAILABLE_MESSAGE,
	ictTaskSchema,
	type CriticalTaskLibraryPersistence
} from '../contracts';
import { mapIctTask, taskCreateValues, taskPatchValues, TASK_SELECT, type SavedIctTask } from './ictTaskMapping.server';
import {
	acknowledgedRows,
	confirmInsertedRows,
	isUnknownWriteStatus,
	readBackInChunks,
	writeUnconfirmed
} from './criticalTaskWriteOutcome.server';

function throwWriteError(error: { code?: string; message: string }): never {
	if (error.code === '23505' && error.message.includes('"ict_tasks_organization_id_task_code_key"')) {
		fail(409, ICT_TASK_CODE_EXISTS_MESSAGE);
	}
	throw new Error(error.message);
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
			query = options.ordered ? query.order('sort_order').order('task_code') : query.order('id');
			return query.range(from, to);
		});
		if (error) throw new Error((error as { message: string }).message);
		return (data ?? []).map(mapIctTask);
	}

	function listReferenced(ids: string[]) {
		return readBackInChunks([...new Set(ids)], (chunk) =>
			listRows({ includeArchived: true, ordered: true, ids: chunk })
		);
	}

	return {
		listCatalog(options = {}) {
			return listRows({ includeArchived: options.includeArchived ?? false, ordered: true });
		},
		listImportCandidates() {
			return listRows({ includeArchived: true, ordered: false });
		},
		listReferenced,
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
			const row = { ...taskCreateValues(input), id: crypto.randomUUID(), organization_id: orgId };
			const { data, error, status } = await client.from('ict_tasks').insert(row).select(TASK_SELECT).single();
			if (error && !isUnknownWriteStatus(status)) throwWriteError(error);
			const acknowledged = error ? null : acknowledgedRows([data], [row.id], mapIctTask, ictTaskSchema);
			if (acknowledged) return acknowledged[0];
			return (await confirmInsertedRows([row.id], listReferenced, ictTaskSchema))[0];
		},
		async createMany(inputs) {
			if (inputs.length === 0) return [];
			const rows = inputs.map((input) => ({
				...taskCreateValues(input),
				id: crypto.randomUUID(),
				organization_id: orgId
			}));
			const ids = rows.map((row) => row.id);
			const { data, error, status } = await client.from('ict_tasks').insert(rows).select(TASK_SELECT);
			if (error && !isUnknownWriteStatus(status)) throwWriteError(error);
			const acknowledged = error ? null : acknowledgedRows(data, ids, mapIctTask, ictTaskSchema);
			if (acknowledged) return acknowledged;
			return confirmInsertedRows(ids, listReferenced, ictTaskSchema);
		},
		async update(id, patch) {
			const { data, error, status } = await client
				.from('ict_tasks')
				.update(taskPatchValues(patch))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(TASK_SELECT)
				.maybeSingle();
			if (error) {
				if (isUnknownWriteStatus(status)) writeUnconfirmed();
				throwWriteError(error);
			}
			if (!data) return null;
			const acknowledged = acknowledgedRows([data], [id], mapIctTask, ictTaskSchema);
			if (!acknowledged) writeUnconfirmed();
			return acknowledged[0];
		},
		async reorder(changes) {
			// Keep guards in both the preconditions and the required acknowledgement.
			const { data, error } = await client.rpc('reorder_ict_tasks', {
				p_organization_id: orgId,
				p_changes: changes.map((change) => ({
					id: change.id,
					expected_sort_order: change.expectedSortOrder,
					sort_order: change.sortOrder
				}))
			});
			// A database code means the command's transaction rolled back; postgrest-js reports a lost reply without one.
			if (error) {
				if (error.code === '42501') fail(403, 'You do not have access to configure the Critical Tasks library');
				if (error.code === 'P0002') fail(404, ICT_TASK_UNAVAILABLE_MESSAGE);
				if (['PT409', '40001', '40P01', '55P03'].includes(error.code)) fail(409, ICT_TASK_ORDER_CHANGED_MESSAGE);
				if (['22023', '22P02', '22003'].includes(error.code)) fail(400, 'Invalid task order');
				if (!error.code) writeUnconfirmed();
				throw new Error(error.message);
			}
			const acknowledged = acknowledgedRows(
				data,
				changes.map((change) => change.id),
				mapIctTask,
				ictTaskSchema
			);
			const saved = new Map(changes.map((change) => [change.id, change.sortOrder]));
			if (!acknowledged || acknowledged.some((task) => saved.get(task.id) !== task.sortOrder)) writeUnconfirmed();
			return acknowledged;
		}
	};
}
