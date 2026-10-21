export type { TrainingType, PersonnelTraining, TrainingStatus, TrainingView } from './training.types';
export { TRAINING_STATUS_COLORS } from './training.types';

export { personnelTrainingsStore } from './stores/personnelTrainings.svelte';
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
export { trainingViewsStore } from './stores/trainingViews.svelte';
export { trainingWorkspaceHydrator } from './trainingWorkspaceHydration.svelte';
export { default as TrainingPageView } from './components/TrainingPageView.svelte';
export { default as TrainingModals } from './components/TrainingModals.svelte';
export { default as TrainingTypesPage } from './components/TrainingTypesPage.svelte';
export { default as TrainingViewsPage } from './components/TrainingViewsPage.svelte';
export { default as TrainingReportsPage } from './components/TrainingReportsPage.svelte';
export { default as PersonnelTrainingReadinessTable } from './components/PersonnelTrainingReadinessTable.svelte';
export { default as PersonnelTrainingDrawer } from './components/PersonnelTrainingDrawer.svelte';

export { recordTrainingCompletions } from './personnelTrainingRequests';
export function loadRecordClassDialog() {
	return import('./components/RecordClassDialog.svelte');
}
