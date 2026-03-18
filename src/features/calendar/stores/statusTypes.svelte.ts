import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { StatusType } from '../calendar.types';

const store = createCrudStore<StatusType>({ resource: 'status-types' });

export const statusTypesStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.removeBool,
	getById: (id: string) => store.getItems().find((t) => t.id === id)
};
