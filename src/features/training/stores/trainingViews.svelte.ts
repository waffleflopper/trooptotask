import { defineStore } from '$lib/stores/core';
import type { TrainingView } from '$features/training/training.types';

export const trainingViewsStore = defineStore<TrainingView>({
	table: 'training_views',
	orderBy: [{ field: 'name' }]
});
