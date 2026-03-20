import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';

const store = createCrudStore<RatingSchemeEntry>({ resource: 'rating-scheme' });

export const ratingSchemeStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove
};
