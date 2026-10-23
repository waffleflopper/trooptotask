import { z } from 'zod';
import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import {
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	ictTaskImportReplySchema,
	ictTaskSchema,
	type IctTaskImportRecord,
	type IctTaskOrderChange
} from '../contracts';
import { postImportChunk } from '$lib/utils/importChunkRequest';
import { adoptImportReply } from './importReplies';
import type { ChunkReply } from '$lib/components/patterns/import-flow';

interface IctTasksExtensions extends Record<string, unknown> {
	load: (items: IctTask[], orgId: string) => void;
	importChunk: (records: IctTaskImportRecord[]) => Promise<ChunkReply>;
	/** Sends every participant, including guards, in one move and adopts the full acknowledgement. */
	reorder: (changes: IctTaskOrderChange[]) => Promise<void>;
}

function enhance(base: Store<IctTask>, internals: StoreInternals<IctTask>): IctTasksExtensions {
	return {
		load(items: IctTask[], orgId: string) {
			base.load(items, orgId);
		},

		async importChunk(records) {
			const reply = await internals.withinOrganization(
				postImportChunk(
					`/org/${internals.orgId()}/api/ict-tasks/batch`,
					{ records },
					{ fallbackMessage: 'These tasks could not be imported.', schema: ictTaskImportReplySchema }
				)
			);
			return adoptImportReply(reply, (added, updated) => base.mergeBatchResults(added, updated));
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
