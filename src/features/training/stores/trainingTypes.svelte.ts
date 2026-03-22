import { defineStore } from '$lib/stores/core';
import type { TrainingType } from '$features/training/training.types';

export const trainingTypesStore = defineStore<TrainingType>({
	table: 'training_types',
	orderBy: [{ field: 'sortOrder' }]
});
