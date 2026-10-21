/**
 * Mutations go through the Training catalog route and its owner-held operations.
 */
import { defineStore } from '$lib/stores/core';
import type { TrainingType } from '$features/training/training.types';

export const trainingTypesStore = defineStore<TrainingType>({
	table: 'training_types',
	orderBy: [{ field: 'sortOrder' }]
});
