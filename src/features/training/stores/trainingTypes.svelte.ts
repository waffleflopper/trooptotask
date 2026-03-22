import { defineStore } from '$lib/stores/core';
import type { TrainingType } from '$features/training/training.types';

const _base = defineStore<TrainingType>({ table: 'training_types', orderBy: [{ field: 'sortOrder' }] });

export const trainingTypesStore = {
	get list(): TrainingType[] {
		return _base.items;
	},
	load: _base.load,
	add: _base.add,
	update: _base.update,
	remove: _base.remove,
	getById: _base.getById
};
