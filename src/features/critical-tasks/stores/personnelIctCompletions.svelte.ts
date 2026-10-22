import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import {
	CRITICAL_TASK_IMPORT_NOT_ATTEMPTED_MESSAGE,
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	ictCompletionBatchImportResultSchema,
	type PersonnelIctCompletion,
	type PersonnelIctCompletionWrite,
	type IctCompletionBatchImportInput,
	type IctCompletionBatchImportResult,
	type IctCompletionImportMappedRow,
	type IctCompletionImportResult
} from '../contracts';
import { importRowPersonnelName } from '../utils/ictCompletionImport';
import { postImportChunk } from '$lib/utils/importChunkRequest';

const MAX_BATCH_SIZE = 500;

interface PersonnelIctCompletionsExtensions extends Record<string, unknown> {
	load: (items: PersonnelIctCompletion[], orgId: string) => void;
	startLoading: () => void;
	invalidateImports: () => void;
	add: (data: PersonnelIctCompletionWrite) => Promise<PersonnelIctCompletion | null>;
	update: (id: string, data: Partial<PersonnelIctCompletionWrite>) => Promise<boolean>;
	updateOrThrow: (id: string, data: Partial<PersonnelIctCompletionWrite>) => Promise<boolean>;
	getByPersonnelAndTask: (personnelId: string, ictTaskId: string) => PersonnelIctCompletion[];
	removeByPersonnelLocal: (personnelId: string) => void;
	removeByIctTaskLocal: (ictTaskId: string) => void;
	importBatch: (input: IctCompletionBatchImportInput) => Promise<IctCompletionImportResult>;
}

function enhance(
	base: Store<PersonnelIctCompletion>,
	internals: StoreInternals<PersonnelIctCompletion>
): PersonnelIctCompletionsExtensions {
	let workspaceVersion = 0;
	return {
		invalidateImports() {
			workspaceVersion++;
		},

		startLoading() {
			workspaceVersion++;
			base.startLoading();
		},

		load(items: PersonnelIctCompletion[], orgId: string) {
			workspaceVersion++;
			base.load(items, orgId);
		},

		async add(data: PersonnelIctCompletionWrite) {
			return base.add(data as Omit<PersonnelIctCompletion, 'id'>);
		},

		async update(id: string, data: Partial<PersonnelIctCompletionWrite>) {
			return base.update(id, data as Partial<Omit<PersonnelIctCompletion, 'id'>>);
		},

		async updateOrThrow(id: string, data: Partial<PersonnelIctCompletionWrite>) {
			return base.updateOrThrow(id, data as Partial<Omit<PersonnelIctCompletion, 'id'>>);
		},

		getByPersonnelAndTask(personnelId: string, ictTaskId: string) {
			return base.items.filter((item) => item.personnelId === personnelId && item.ictTaskId === ictTaskId);
		},

		removeByPersonnelLocal(personnelId: string) {
			base.removeLocalWhere((item) => item.personnelId === personnelId);
		},

		removeByIctTaskLocal(ictTaskId: string) {
			base.removeLocalWhere((item) => item.ictTaskId === ictTaskId);
		},

		async importBatch(input) {
			const importVersion = workspaceVersion;
			const orgId = internals.orgId();
			function requireCurrentWorkspace() {
				if (importVersion !== workspaceVersion) {
					throw new Error(
						'Critical Tasks workspace changed during import. Reload it to check saved rows before retrying.'
					);
				}
			}
			const result: IctCompletionImportResult = {
				inserted: [],
				updated: [],
				errors: [],
				unconfirmed: [],
				notAttempted: []
			};
			const rowIssue = (record: IctCompletionImportMappedRow, message: string) => ({
				rowNumber: record.rowNumber,
				personnelName: importRowPersonnelName(record.values),
				taskCode: (record.values.taskCode ?? '').trim().toUpperCase(),
				message
			});

			for (let index = 0; index < input.records.length; index += MAX_BATCH_SIZE) {
				requireCurrentWorkspace();
				const chunk = input.records.slice(index, index + MAX_BATCH_SIZE);
				const reply = await postImportChunk<IctCompletionBatchImportResult>(
					`/org/${orgId}/api/personnel-ict-completions/batch`,
					{ records: chunk },
					{
						fallbackMessage: 'Failed to import critical task completions',
						schema: ictCompletionBatchImportResultSchema
					}
				);
				requireCurrentWorkspace();
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
				base.mergeBatchResults(data.inserted, data.updated);
				result.inserted.push(...data.inserted);
				result.updated.push(...data.updated);
				result.errors.push(...data.errors);
				result.unconfirmed.push(...data.unconfirmed);
			}

			return result;
		}
	};
}

export const personnelIctCompletionsStore = defineStore<PersonnelIctCompletion, PersonnelIctCompletionsExtensions>(
	{
		table: 'personnel_ict_completions',
		orderBy: [{ field: 'completedAt', ascending: false }]
	},
	enhance
);
