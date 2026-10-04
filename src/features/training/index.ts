// Types
export type { TrainingType, PersonnelTraining, TrainingStatus, TrainingView } from './training.types';
export { TRAINING_STATUS_COLORS } from './training.types';

// Stores
export { personnelTrainingsStore } from './stores/personnelTrainings.svelte';
export { trainingTypeSource, trainingTypeHydration } from './webSources.svelte';

// Utils
export { isTrainingApplicable } from './utils/applicability';
export { filterColumnsByView } from './utils/viewFiltering';
export {
	calculateExpirationDate,
	getTrainingStatus,
	getDelinquentTrainings,
	getTrainingStats
} from './utils/trainingStatus';
export type { TrainingStatusInfo, TrainingStats, DelinquentTraining } from './utils/trainingStatus';
export { filterPersonnel, computeReadinessDashboard, buildPivotTable } from './utils/reportCalculations';
export type { ReportFilters, ReadinessDashboard, PivotRow, PivotCell } from './utils/reportCalculations';
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

// Context
export { TrainingPageContext } from './contexts/TrainingPageContext.svelte';
export type { TrainingPageData } from './contexts/TrainingPageContext.svelte';

export { buildTrainingReportWorkbook, exportTrainingReportWorkbook } from './utils/trainingReportWorkbook';
export { trainingTypesStore } from './stores/trainingTypes.svelte';
export { trainingViewsStore } from './stores/trainingViews.svelte';
export { trainingWorkspaceHydrator } from './trainingWorkspaceHydration.svelte';
export { default as TrainingPageView } from './components/TrainingPageView.svelte';
export { default as TrainingModals } from './components/TrainingModals.svelte';
export { default as TrainingTypesPage } from './components/TrainingTypesPage.svelte';
export { default as TrainingViewsPage } from './components/TrainingViewsPage.svelte';
export { default as TrainingReportsPage } from './components/TrainingReportsPage.svelte';
