import { defineStore } from '$lib/stores/core';
import type { RatingSchemeEntry } from '../rating-scheme.types';

const _base = defineStore<RatingSchemeEntry>({
	table: 'rating_scheme_entries',
	overrides: { resource: 'rating-scheme' }
});

export const ratingSchemeStore = {
	get list(): RatingSchemeEntry[] {
		return _base.items;
	},
	load: _base.load,
	add: _base.add,
	update: _base.update,
	remove: _base.remove
};
