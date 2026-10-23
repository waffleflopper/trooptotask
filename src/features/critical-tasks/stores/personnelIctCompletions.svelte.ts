import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import {
	ictCompletionImportReplySchema,
	type IctCompletionImportRecord,
	type PersonnelIctCompletion,
	type PersonnelIctCompletionWrite
} from '../contracts';
import { postImportChunk } from '$lib/utils/importChunkRequest';
import { adoptImportReply } from './importReplies';
import type { ChunkReply } from '$lib/components/patterns/import-flow';

const WORKSPACE_CHANGED_MESSAGE =
	'Critical Tasks workspace changed during import. Reload it to check saved rows before retrying.';

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
	importChunk: (records: IctCompletionImportRecord[]) => Promise<ChunkReply>;
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

		async importChunk(records) {
			const importVersion = workspaceVersion;
			const orgId = internals.orgId();
			const reply = await postImportChunk(
				`/org/${orgId}/api/personnel-ict-completions/batch`,
				{ records },
				{ fallbackMessage: 'These completions could not be imported.', schema: ictCompletionImportReplySchema }
			);
			if (importVersion !== workspaceVersion) throw new Error(WORKSPACE_CHANGED_MESSAGE);
			return adoptImportReply(reply, (added, updated) => base.mergeBatchResults(added, updated));
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
