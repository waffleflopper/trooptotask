import { defineStore } from '$lib/stores/core';
import type { TrainingTypeLabel } from '$features/training/contracts';

export const onboardingTrainingTypes = defineStore<TrainingTypeLabel>({ table: 'training_types' });
