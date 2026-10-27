export type { TrainingType, PersonnelTraining, TrainingStatus, TrainingView } from './training.types';
export { TRAINING_STATUS_COLORS } from './training.types';

export { personnelTrainingsStore } from './stores/personnelTrainings.svelte';
export { loadPersonTrainingRecords, recordTrainingCompletions, saveTrainingRecord } from './personnelTrainingRequests';
export { trainingTypeSource, trainingTypeHydration } from './webSources.svelte';

export { isTrainingApplicable } from './utils/applicability';
export { filterColumnsByView } from './utils/viewFiltering';
export {
	calculateExpirationDate,
	getTrainingStatus,
	getDelinquentTrainings,
	getTrainingStats
} from './utils/trainingStatus';
export type { TrainingStatusInfo, TrainingStats, DelinquentTraining } from './utils/trainingStatus';
export { filterPersonnel } from './utils/reportCalculations';
export { buildTrainingBriefing, matchBriefingRequirements } from './utils/trainingBriefing';
export type {
	BriefingBand,
	BriefingFocusArea,
	BriefingGridRow,
	BriefingReadiness,
	BriefingRequirement,
	BriefingRowsBy,
	BriefingScope,
	FocusCandidateKey,
	TrainingBriefing,
	TrainingBriefingFilters,
	TrainingBriefingInput
} from './utils/trainingBriefing.types';

export { TrainingPageContext } from './contexts/TrainingPageContext.svelte';
export type { TrainingPageData } from './contexts/TrainingPageContext.svelte';

export { trainingTypesStore } from './stores/trainingTypes.svelte';
export { loadTrainingTypeEditor, type LoadedTrainingTypeEditor } from './trainingTypeEditor';
export { trainingViewsStore } from './stores/trainingViews.svelte';
export { trainingWorkspaceHydrator } from './trainingWorkspaceHydration.svelte';

export function loadRecordClassDialog() {
	return import('./components/RecordClassDialog.svelte');
}

/** The record editor, loaded on first open. */
export function loadTrainingRecordModal() {
	return import('./components/TrainingRecordModal.svelte');
}
export { createTrainingImportLane, type TrainingImportColumns } from './import/trainingImportLane';
