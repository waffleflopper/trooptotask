import { createStore } from '$lib/stores/core';
import type { RatingSchemeEntry } from '../rating-scheme.types';

const store = createStore<RatingSchemeEntry>({ resource: 'rating-scheme' });

export const ratingSchemeStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.remove
};
