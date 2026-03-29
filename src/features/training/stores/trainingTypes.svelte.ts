/**
 * Training types store — the org's training requirement definitions, sorted by `sortOrder`.
 * Each row defines a training requirement (name, validity period, warning thresholds,
 * applicability rules). Loaded by the shared layout data query and training page.
 * Mutations go through the entity CRUD route wired to `TrainingTypeEntity`.
 */
import { defineStore } from '$lib/stores/core';
import type { TrainingType } from '$features/training/training.types';

export const trainingTypesStore = defineStore<TrainingType>({
	table: 'training_types',
	orderBy: [{ field: 'sortOrder' }]
});
