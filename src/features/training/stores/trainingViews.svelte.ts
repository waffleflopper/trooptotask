/**
 * Training views store — saved column-selection presets for the training matrix.
 * Each view stores an ordered array of training type IDs defining which columns to show.
 * Loaded by the training page. Mutations go through the entity CRUD route.
 * The active view is tracked in `TrainingPageContext.svelte.ts`, not in this store.
 */
import { defineStore } from '$lib/stores/core';
import type { TrainingView } from '$features/training/training.types';

export const trainingViewsStore = defineStore<TrainingView>({
	table: 'training_views',
	orderBy: [{ field: 'name' }]
});
