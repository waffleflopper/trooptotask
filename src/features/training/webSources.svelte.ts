import type { TrainingType } from './training.types';
import { trainingTypesStore } from './stores/trainingTypes.svelte';

/** Read-only catalog facts used by other feature screens. */
export const trainingTypeSource = {
	get items(): TrainingType[] {
		return trainingTypesStore.items;
	},
	get loading() {
		return trainingTypesStore.loading;
	}
};

/** Apply route snapshots without exposing Training mutations to another feature. */
export const trainingTypeHydration = {
	get loadVersion() {
		return trainingTypesStore.loadVersion;
	},
	get orgId() {
		return trainingTypesStore.orgId;
	},
	load(items: TrainingType[], orgId: string) {
		trainingTypesStore.load(items, orgId);
	},
	startLoading() {
		trainingTypesStore.startLoading();
	}
};
