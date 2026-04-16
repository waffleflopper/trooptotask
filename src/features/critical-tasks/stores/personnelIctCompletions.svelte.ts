import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import type { PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { IctCompletionImportMappedRow } from '$features/critical-tasks/utils/ictCompletionImport';

type PersonnelIctCompletionWrite = Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>;
const MAX_BATCH_SIZE = 500;

interface IctCompletionImportBatchError {
	rowNumber: number;
	personnelName: string;
	taskCode: string;
	message: string;
}

interface IctCompletionImportBatchResult {
	inserted: PersonnelIctCompletion[];
	updated: PersonnelIctCompletion[];
	errors: IctCompletionImportBatchError[];
}

interface PersonnelIctCompletionsExtensions extends Record<string, unknown> {
	load: (items: PersonnelIctCompletion[], orgId: string) => void;
	add: (data: PersonnelIctCompletionWrite) => Promise<PersonnelIctCompletion | null>;
	update: (id: string, data: Partial<PersonnelIctCompletionWrite>) => Promise<boolean>;
	getByPersonnelAndTask: (personnelId: string, ictTaskId: string) => PersonnelIctCompletion[];
	removeByPersonnelLocal: (personnelId: string) => void;
	removeByIctTaskLocal: (ictTaskId: string) => void;
	importBatch: (input: { records: IctCompletionImportMappedRow[] }) => Promise<IctCompletionImportBatchResult>;
}

async function readResponseErrorMessage(response: Response, fallback: string): Promise<string> {
	try {
		const data = await response.json();
		if (typeof data === 'string' && data.trim()) return data.trim();
		if (data && typeof data === 'object') {
			const record = data as Record<string, unknown>;
			const detail = [record.message, record.error, record.details].find(
				(value) => typeof value === 'string' && value.trim().length > 0
			);
			if (typeof detail === 'string') return detail;
		}
	} catch {
		// Ignore response parsing issues and fall back to the default message.
	}

	return fallback;
}

function enhance(
	base: Store<PersonnelIctCompletion>,
	internals: StoreInternals<PersonnelIctCompletion>
): PersonnelIctCompletionsExtensions {
	return {
		load(items: PersonnelIctCompletion[], orgId: string) {
			base.load(items, orgId);
		},

		async add(data: PersonnelIctCompletionWrite) {
			return base.add(data as Omit<PersonnelIctCompletion, 'id'>);
		},

		async update(id: string, data: Partial<PersonnelIctCompletionWrite>) {
			return base.update(id, data as Partial<Omit<PersonnelIctCompletion, 'id'>>);
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
			const inserted: PersonnelIctCompletion[] = [];
			const updated: PersonnelIctCompletion[] = [];
			const errors: IctCompletionImportBatchError[] = [];

			for (let index = 0; index < input.records.length; index += MAX_BATCH_SIZE) {
				const chunk = input.records.slice(index, index + MAX_BATCH_SIZE);
				const response = await fetch(`/org/${internals.orgId()}/api/personnel-ict-completions/batch`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						records: chunk
					})
				});

				if (!response.ok) {
					throw new Error(await readResponseErrorMessage(response, 'Failed to import critical task completions'));
				}

				const data = (await response.json()) as IctCompletionImportBatchResult;
				const chunkInserted = data.inserted ?? [];
				const chunkUpdated = data.updated ?? [];
				base.mergeBatchResults(chunkInserted, chunkUpdated);
				inserted.push(...chunkInserted);
				updated.push(...chunkUpdated);
				errors.push(...(data.errors ?? []));
			}

			return {
				inserted,
				updated,
				errors
			};
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
