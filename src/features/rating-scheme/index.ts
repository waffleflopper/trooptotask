export type {
	Evaluation,
	RatingScheme,
	RatingSchemeEntryEditorData,
	WorkflowStatus,
	WorkflowStep,
	RatingSchemeEntry,
	RatingDueStatus,
	ReportType,
	ReportTypeOption
} from './contracts';

export {
	OER_REPORT_TYPES,
	NCOER_REPORT_TYPES,
	WOER_REPORT_TYPES,
	WORKFLOW_STEPS,
	RATING_STATUS_COLORS
} from './contracts';

export { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from './utils/ratingScheme';
export { exportRatingScheme } from './utils/ratingSchemeExport';
export { toRatingSchemeEntry } from './utils/ratingSchemeEntries';

export { RatingSchemePageContext } from './contexts/RatingSchemePageContext.svelte';
export type { RatingSchemePageData } from './contexts/RatingSchemePageContext.svelte';
export { RatingSchemeLinesContext, RatingSchemeLinesViewState } from './contexts/RatingSchemeLinesContext.svelte';
export { EvalTrackerContext } from './contexts/EvalTrackerContext.svelte';
export { default as EvalTrackerView } from './components/EvalTrackerView.svelte';
export { default as RatingSchemeLinesView } from './components/RatingSchemeLinesView.svelte';
export { default as EvalsTabs } from './components/EvalsTabs.svelte';
export { ratingSchemeWorkspaceHydrator } from './ratingSchemeWorkspaceHydration.svelte';
export { default as RatingSchemePageView } from './components/RatingSchemePageView.svelte';
export { default as PersonnelEvaluationCard } from './components/PersonnelEvaluationCard.svelte';

/** Keeps the Rating Scheme's sheet and Change rater dialog out of the page's first load. */
export function loadRatingSchemeLinesModals() {
	return import('./components/RatingSchemeLinesModals.svelte');
}

/** Keeps the Evaluation and Start evaluation sheets out of the tracker's first load. */
export function loadEvalTrackerModals() {
	return import('./components/EvalTrackerModals.svelte');
}

/** Keep the editor deferred while delivery consumes the public Web seam. */
export function loadRatingSchemeModals() {
	return import('./components/RatingSchemeModals.svelte');
}

export {
	changeEvaluationRater,
	loadRatingSchemeEntryEditor,
	moveEvaluation,
	saveRatingSchemeEntry
} from './ratingSchemeRequests';
export function loadRatingSchemeEntryModal() {
	return import('./components/RatingSchemeEntryModal.svelte');
}
