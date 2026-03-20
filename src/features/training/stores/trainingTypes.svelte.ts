import { createStore } from '$lib/stores/core';
import type { TrainingType } from '$features/training/training.types';

const store = createStore<TrainingType>({
	resource: 'training-types',
	sort: (a, b) => a.sortOrder - b.sortOrder
});

export const trainingTypesStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove,
	getById: store.getById
};
