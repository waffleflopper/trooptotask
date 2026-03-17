import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { CounselingType } from '../counseling.types';

const store = createCrudStore<CounselingType>({ resource: 'counseling-types' });

export const counselingTypesStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove,
	getById: (id: string) => store.getItems().find((t) => t.id === id)
};
