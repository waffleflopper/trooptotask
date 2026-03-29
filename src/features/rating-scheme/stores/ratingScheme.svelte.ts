/**
 * Rating scheme store — the org's evaluation rating level definitions (e.g., OER/NCOER levels).
 *
 * Uses `overrides: { resource: 'rating-scheme' }` so API calls hit `/api/rating-scheme`
 * instead of the default table-name-derived path.
 *
 * Loaded by the personnel page and dashboard; mutations go through `ratingSchemeEntryCrud.ts`.
 */
import { defineStore } from '$lib/stores/core';
import type { RatingSchemeEntry } from '../rating-scheme.types';

export const ratingSchemeStore = defineStore<RatingSchemeEntry>({
	table: 'rating_scheme_entries',
	overrides: { resource: 'rating-scheme' }
});
