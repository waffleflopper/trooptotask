import type { TrainingType } from './training.types';
import { trainingTypesStore } from './stores/trainingTypes.svelte';
import { DEFAULT_TRAINING_READINESS_GOAL_PERCENT } from '$features/organization/contracts';
import type { TrainingWorkspaceReadiness } from './contracts';

let readiness = $state<TrainingWorkspaceReadiness & { orgId: string }>({
	orgId: '',
	readinessGoalPercent: DEFAULT_TRAINING_READINESS_GOAL_PERCENT,
	readinessAsOf: ''
});

export const trainingReadinessSource = {
	forOrganization(orgId: string): TrainingWorkspaceReadiness {
		return readiness.orgId === orgId
			? readiness
			: { readinessGoalPercent: DEFAULT_TRAINING_READINESS_GOAL_PERCENT, readinessAsOf: '' };
	}
};

export const trainingReadinessHydration = {
	get orgId() {
		return readiness.orgId;
	},
	load(value: TrainingWorkspaceReadiness, orgId: string) {
		readiness = { ...value, orgId };
	},
	clear() {
		readiness = { orgId: '', readinessGoalPercent: DEFAULT_TRAINING_READINESS_GOAL_PERCENT, readinessAsOf: '' };
	}
};

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
