import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import type { IctTaskImportMappedRow, IctTaskImportMode } from '$features/critical-tasks/utils/ictTaskImport';

const MAX_BATCH_SIZE = 500;

let orgIdRef = '';

interface IctTaskImportBatchError {
	rowNumber: number;
	taskCode: string;
	title: string;
	message: string;
}

interface IctTaskImportBatchResult {
	inserted: IctTask[];
	updated: IctTask[];
	restored: IctTask[];
	errors: IctTaskImportBatchError[];
}

interface IctTasksExtensions extends Record<string, unknown> {
	load: (items: IctTask[], orgId: string) => void;
	importBatch: (input: {
		mode: IctTaskImportMode;
		records: IctTaskImportMappedRow[];
	}) => Promise<IctTaskImportBatchResult>;
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

function enhance(base: Store<IctTask>): IctTasksExtensions {
	return {
		load(items: IctTask[], orgId: string) {
			orgIdRef = orgId;
			base.load(items, orgId);
		},

		async importBatch(input) {
			const inserted: IctTask[] = [];
			const updated: IctTask[] = [];
			const restored: IctTask[] = [];
			const errors: IctTaskImportBatchError[] = [];

			for (let index = 0; index < input.records.length; index += MAX_BATCH_SIZE) {
				const chunk = input.records.slice(index, index + MAX_BATCH_SIZE);
				const response = await fetch(`/org/${orgIdRef}/api/ict-tasks/batch`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						mode: input.mode,
						records: chunk
					})
				});

				if (!response.ok) {
					throw new Error(await readResponseErrorMessage(response, 'Failed to import ICT tasks'));
				}

				const data = (await response.json()) as IctTaskImportBatchResult;
				const chunkInserted = data.inserted ?? [];
				const chunkUpdated = data.updated ?? [];
				const chunkRestored = data.restored ?? [];
				base.mergeBatchResults(chunkInserted, [...chunkUpdated, ...chunkRestored]);
				inserted.push(...chunkInserted);
				updated.push(...chunkUpdated);
				restored.push(...chunkRestored);
				errors.push(...(data.errors ?? []));
			}

			return {
				inserted,
				updated,
				restored,
				errors
			};
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
