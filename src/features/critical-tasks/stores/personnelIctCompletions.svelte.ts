import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

type PersonnelIctCompletionWrite = Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>;

interface PersonnelIctCompletionsExtensions extends Record<string, unknown> {
	add: (data: PersonnelIctCompletionWrite) => Promise<PersonnelIctCompletion | null>;
	update: (id: string, data: Partial<PersonnelIctCompletionWrite>) => Promise<boolean>;
	getByPersonnelAndTask: (personnelId: string, ictTaskId: string) => PersonnelIctCompletion[];
	removeByPersonnelLocal: (personnelId: string) => void;
	removeByIctTaskLocal: (ictTaskId: string) => void;
}

function enhance(base: Store<PersonnelIctCompletion>): PersonnelIctCompletionsExtensions {
	return {
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
