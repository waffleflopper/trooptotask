/**
 * Uses resource overrides so API calls hit `/api/rating-scheme` and `/api/evaluations`.
 *
 * Loaded through controlled Evals hydration; mutations use Rating-owned Server operations.
 */
import { defineStore } from '$lib/stores/core';
import type { Evaluation, RatingScheme, RatingSchemeEntry } from '../rating-scheme.types';
import { toRatingSchemeEntries } from '../utils/ratingSchemeEntries';
import { toRatingSchemeLines } from '../utils/ratingSchemeLines';

export const ratingSchemeStore = defineStore<RatingScheme>({
	table: 'rating_schemes',
	overrides: { resource: 'rating-scheme' }
});

export const evaluationStore = defineStore<Evaluation>({
	table: 'evaluations',
	overrides: { resource: 'evaluations' }
});

/** The Evaluations the Evals page lists, each with the chain it shows; recomputed only when either store changes. */
class RatingSchemeEntries {
	readonly items: RatingSchemeEntry[] = $derived(toRatingSchemeEntries(ratingSchemeStore.items, evaluationStore.items));
}

export const ratingSchemeEntries = new RatingSchemeEntries();

/** The Rating Scheme's lines, one per scheme with its open Evaluation; recomputed only when either store changes. */
class RatingSchemeLines {
	readonly items = $derived(toRatingSchemeLines(ratingSchemeStore.items, evaluationStore.items));
}

export const ratingSchemeLines = new RatingSchemeLines();
