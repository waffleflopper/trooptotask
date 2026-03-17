import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { CounselingRecord } from '../counseling.types';

const store = createCrudStore<CounselingRecord>({ resource: 'counseling-records' });

export const counselingRecordsStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove,
	getById: (id: string) => store.getItems().find((r) => r.id === id),
	getByPersonnelId: (personnelId: string) => store.getItems().filter((r) => r.personnelId === personnelId),
	removeByTypeLocal: (typeId: string) => store.setItems(store.getItems().filter((r) => r.counselingTypeId !== typeId))
};
