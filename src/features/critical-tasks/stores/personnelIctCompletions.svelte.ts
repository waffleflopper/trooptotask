import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

interface PersonnelIctCompletionsExtensions extends Record<string, unknown> {
	getByPersonnelAndTask: (personnelId: string, ictTaskId: string) => PersonnelIctCompletion[];
	removeByPersonnelLocal: (personnelId: string) => void;
	removeByIctTaskLocal: (ictTaskId: string) => void;
}

function enhance(base: Store<PersonnelIctCompletion>): PersonnelIctCompletionsExtensions {
	return {
		getByPersonnelAndTask(personnelId: string, ictTaskId: string) {
			return base.items.filter((item) => item.personnelId === personnelId && item.ictTaskId === ictTaskId);
		},

		removeByPersonnelLocal(personnelId: string) {
			base.removeLocalWhere((item) => item.personnelId === personnelId);
		},

		removeByIctTaskLocal(ictTaskId: string) {
			base.removeLocalWhere((item) => item.ictTaskId === ictTaskId);
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
