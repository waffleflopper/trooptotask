import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { PersonnelTraining } from '$features/training/training.types';

const store = createCrudStore<PersonnelTraining>({
	resource: 'personnel-trainings',
	beforeAdd(items, data) {
		const displaced = items.find(
			(t) => t.personnelId === data.personnelId && t.trainingTypeId === data.trainingTypeId
		);
		return {
			items: items.filter(
				(t) => !(t.personnelId === data.personnelId && t.trainingTypeId === data.trainingTypeId)
			),
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
	getById: (id: string) => store.getItems().find((t) => t.id === id),
	getByPersonnelAndType: (personnelId: string, trainingTypeId: string) =>
		store.getItems().find((t) => t.personnelId === personnelId && t.trainingTypeId === trainingTypeId),

	addBatchResults(inserted: PersonnelTraining[], updated: PersonnelTraining[]) {
		const updatedIds = new Set(updated.map((u) => u.id));
		store.setItems([...store.getItems().filter((t) => !updatedIds.has(t.id)), ...inserted, ...updated]);
	},

	removeByPersonnelLocal(personnelId: string) {
		store.setItems(store.getItems().filter((t) => t.personnelId !== personnelId));
	},

	removeByTrainingTypeLocal(trainingTypeId: string) {
		store.setItems(store.getItems().filter((t) => t.trainingTypeId !== trainingTypeId));
	}
};
