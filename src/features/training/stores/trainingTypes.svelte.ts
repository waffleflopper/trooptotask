import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { TrainingType } from '$features/training/training.types';

const store = createCrudStore<TrainingType>({ resource: 'training-types' });

export const trainingTypesStore = {
	get list() {
		return [...store.items].sort((a, b) => a.sortOrder - b.sortOrder);
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove,
	getById: (id: string) => store.getItems().find((t) => t.id === id)
};
