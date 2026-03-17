import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { DevelopmentGoal } from '../counseling.types';

const store = createCrudStore<DevelopmentGoal>({ resource: 'development-goals' });

export const developmentGoalsStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove,
	getById: (id: string) => store.getItems().find((g) => g.id === id),
	getByPersonnelId: (personnelId: string) =>
		store.getItems().filter((g) => g.personnelId === personnelId)
};
