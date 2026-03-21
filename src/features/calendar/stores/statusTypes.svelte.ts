import { createStore } from '$lib/stores/core';
import type { StatusType } from '$lib/types';

const store = createStore<StatusType>({ resource: 'status-types' });

export const statusTypesStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.removeBool,
	getById: store.getById
};
