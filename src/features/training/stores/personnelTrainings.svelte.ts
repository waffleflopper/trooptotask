import { createStore } from '$lib/stores/core';
import type { PersonnelTraining } from '$features/training/training.types';

const store = createStore<PersonnelTraining>({
	resource: 'personnel-trainings',
	beforeAdd(items, data) {
		const displaced = items.find((t) => t.personnelId === data.personnelId && t.trainingTypeId === data.trainingTypeId);
		return {
			items: items.filter((t) => !(t.personnelId === data.personnelId && t.trainingTypeId === data.trainingTypeId)),
			displaced
		};
	}
});

export const personnelTrainingsStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove,
	getById: (id: string) => store.getById(id),
	getByPersonnelAndType: (personnelId: string, trainingTypeId: string) =>
		store.find((t) => t.personnelId === personnelId && t.trainingTypeId === trainingTypeId),

	addBatchResults: store.mergeBatchResults,

	removeByPersonnelLocal(personnelId: string) {
		store.removeLocalWhere((t) => t.personnelId === personnelId);
	},

	removeByTrainingTypeLocal(trainingTypeId: string) {
		store.removeLocalWhere((t) => t.trainingTypeId === trainingTypeId);
	}
};
