/**
 * Uses `overrides: { resource: 'rating-scheme' }` so API calls hit `/api/rating-scheme`
 * instead of the default table-name-derived path.
 *
 * Loaded through controlled Evals hydration; mutations use Rating-owned Server operations.
 */
import { defineStore } from '$lib/stores/core';
import type { RatingSchemeEntry } from '../rating-scheme.types';

export const ratingSchemeStore = defineStore<RatingSchemeEntry>({
	table: 'rating_scheme_entries',
	overrides: { resource: 'rating-scheme' }
});
