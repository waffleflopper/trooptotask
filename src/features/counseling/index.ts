// Counseling feature barrel export

// Types
export type {
	CounselingType,
	CounselingRecord,
	DevelopmentGoal,
	PersonnelExtendedInfo,
	ReportType,
	ReportTypeOption,
	WorkflowStatus,
	WorkflowStatusOption,
	RatingSchemeEntry,
	RatingDueStatus
} from './counseling.types';

export {
	OER_REPORT_TYPES,
	NCOER_REPORT_TYPES,
	WOER_REPORT_TYPES,
	WORKFLOW_STATUS_OPTIONS,
	WORKFLOW_STATUS_COLORS,
	RATING_STATUS_COLORS
} from './counseling.types';

// Stores
export { counselingRecordsStore } from './stores/counselingRecords.svelte';
export { counselingTypesStore } from './stores/counselingTypes.svelte';
export { developmentGoalsStore } from './stores/developmentGoals.svelte';
export { ratingSchemeStore } from './stores/ratingScheme.svelte';

// Utils
export { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from './utils/ratingScheme';
export { exportRatingScheme } from './utils/ratingSchemeExport';

// Components are imported directly from their paths:
// $features/counseling/components/SoldierLeadersBookView.svelte
// $features/counseling/components/CounselingRecordModal.svelte
// $features/counseling/components/CounselingTypeManager.svelte
// $features/counseling/components/DevelopmentGoalModal.svelte
// $features/counseling/components/RatingSchemeEntryModal.svelte
// $features/counseling/components/RatingSchemeTableView.svelte
// $features/counseling/components/RatingSchemeGroupedView.svelte
