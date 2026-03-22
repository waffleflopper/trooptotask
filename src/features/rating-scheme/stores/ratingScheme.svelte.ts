import { defineStore } from '$lib/stores/core';
import type { RatingSchemeEntry } from '../rating-scheme.types';

export const ratingSchemeStore = defineStore<RatingSchemeEntry>({
	table: 'rating_scheme_entries',
	overrides: { resource: 'rating-scheme' }
});
