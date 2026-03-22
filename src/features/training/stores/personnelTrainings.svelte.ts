import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import type { PersonnelTraining } from '$features/training/training.types';

interface PersonnelTrainingsExtensions extends Record<string, unknown> {
	getByPersonnelAndType: (personnelId: string, trainingTypeId: string) => PersonnelTraining | undefined;
	addBatchResults: (inserted: PersonnelTraining[], updated?: PersonnelTraining[]) => void;
	removeByPersonnelLocal: (personnelId: string) => void;
	removeByTrainingTypeLocal: (trainingTypeId: string) => void;
}

function enhance(base: Store<PersonnelTraining>): PersonnelTrainingsExtensions {
	return {
		getByPersonnelAndType(personnelId: string, trainingTypeId: string) {
			return base.find((t) => t.personnelId === personnelId && t.trainingTypeId === trainingTypeId);
		},

		addBatchResults: base.mergeBatchResults,

		removeByPersonnelLocal(personnelId: string) {
			base.removeLocalWhere((t) => t.personnelId === personnelId);
		},

		removeByTrainingTypeLocal(trainingTypeId: string) {
			base.removeLocalWhere((t) => t.trainingTypeId === trainingTypeId);
		}
	};
}

export const personnelTrainingsStore = defineStore<PersonnelTraining, PersonnelTrainingsExtensions>(
	{
		table: 'personnel_trainings',
		overrides: {
			beforeAdd(items, data) {
				const displaced = items.find(
					(t) => t.personnelId === data.personnelId && t.trainingTypeId === data.trainingTypeId
				);
				return {
					items: items.filter((t) => !(t.personnelId === data.personnelId && t.trainingTypeId === data.trainingTypeId)),
					displaced
				};
			}
		}
	},
	enhance
);
