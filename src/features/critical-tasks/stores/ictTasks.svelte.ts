import { z } from 'zod';
import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import {
	CRITICAL_TASK_IMPORT_NOT_ATTEMPTED_MESSAGE,
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	ictTaskBatchImportResultSchema,
	ictTaskSchema,
	type IctTaskBatchImportResult,
	type IctTaskImportResult,
	type IctTaskOrderChange
} from '../contracts';
import { postImportChunk } from './importChunkRequest';
import type { IctTaskImportMappedRow, IctTaskImportMode } from '$features/critical-tasks/utils/ictTaskImport';

const MAX_BATCH_SIZE = 500;

interface IctTasksExtensions extends Record<string, unknown> {
	load: (items: IctTask[], orgId: string) => void;
	importBatch: (input: { mode: IctTaskImportMode; records: IctTaskImportMappedRow[] }) => Promise<IctTaskImportResult>;
	/** Sends one all-or-nothing move. Rejects with the refusal reason, or with reload guidance when the outcome is unknown. */
	reorder: (changes: IctTaskOrderChange[]) => Promise<void>;
}

function enhance(base: Store<IctTask>, internals: StoreInternals<IctTask>): IctTasksExtensions {
	return {
		load(items: IctTask[], orgId: string) {
			base.load(items, orgId);
		},

		async importBatch(input) {
			const result: IctTaskImportResult = {
				inserted: [],
				updated: [],
				restored: [],
				errors: [],
				unconfirmed: [],
				notAttempted: []
			};
			const rowIssue = (record: IctTaskImportMappedRow, message: string) => ({
				rowNumber: record.rowNumber,
				taskCode: (record.values.taskCode ?? '').trim(),
				title: (record.values.title ?? '').trim(),
				message
			});

			for (let index = 0; index < input.records.length; index += MAX_BATCH_SIZE) {
				const chunk = input.records.slice(index, index + MAX_BATCH_SIZE);
				const reply = await internals.withinOrganization(
					postImportChunk<IctTaskBatchImportResult>(
						`/org/${internals.orgId()}/api/ict-tasks/batch`,
						{ mode: input.mode, records: chunk },
						{
							fallbackMessage: 'Failed to import ICT tasks',
							schema: ictTaskBatchImportResultSchema
						}
					)
				);
				if (reply.kind !== 'saved') {
					if (reply.kind === 'refused') result.errors.push(...chunk.map((record) => rowIssue(record, reply.message)));
					else
						result.unconfirmed.push(
							...chunk.map((record) => rowIssue(record, CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE))
						);
					result.notAttempted.push(
						...input.records
							.slice(index + MAX_BATCH_SIZE)
							.map((record) => rowIssue(record, CRITICAL_TASK_IMPORT_NOT_ATTEMPTED_MESSAGE))
					);
					return result;
				}
				const { data } = reply;
				base.mergeBatchResults(data.inserted, [...data.updated, ...data.restored]);
				result.inserted.push(...data.inserted);
				result.updated.push(...data.updated);
				result.restored.push(...data.restored);
				result.errors.push(...data.errors);
				result.unconfirmed.push(...data.unconfirmed);
			}

			return result;
		},

		async reorder(changes) {
			const reply = await internals.withinOrganization(
				postImportChunk<IctTask[]>(
					`/org/${internals.orgId()}/api/ict-tasks/order`,
					{ changes },
					{ fallbackMessage: 'Could not move the task', schema: z.array(ictTaskSchema) }
				)
			);
			if (reply.kind === 'refused') throw new Error(reply.message);
			if (reply.kind === 'unconfirmed') throw new Error(CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE);
			base.mergeBatchResults([], reply.data);
		}
	};
}

export const ictTasksStore = defineStore<IctTask, IctTasksExtensions>(
	{
		table: 'ict_tasks',
		orderBy: [{ field: 'sortOrder' }, { field: 'taskCode' }]
	},
	enhance
);
