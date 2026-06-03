import type { PersonnelLookup } from '$lib/types';
import { WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
import type { RatingSchemeEntry, ReportType, ReportTypeOption, WorkflowStatus } from '../rating-scheme.types';
import {
	calculateThruDate,
	getEvalTypeForRank,
	getExtendedAnnualWarning,
	getReportTypesForEvalType
} from './ratingScheme';

export type RatingSchemeEntryDraftMode = 'internal' | 'external';
export type RatingSchemeEntryEvalType = RatingSchemeEntry['evalType'];
export type RatingSchemeEntryStatus = RatingSchemeEntry['status'];
export type RatingSchemeEntrySaveData = Omit<RatingSchemeEntry, 'id'>;

export interface RatingSchemeEvaluatorDraft {
	mode: RatingSchemeEntryDraftMode;
	personId: string;
	name: string;
}

export interface RatingSchemeEntryDraft {
	ratedPersonId: string;
	evalType: RatingSchemeEntryEvalType;
	reportType: ReportType | '';
	rater: RatingSchemeEvaluatorDraft;
	seniorRater: RatingSchemeEvaluatorDraft;
	showIntermediate: boolean;
	intermediateRater: RatingSchemeEvaluatorDraft;
	showReviewer: boolean;
	reviewer: RatingSchemeEvaluatorDraft;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
	status: RatingSchemeEntryStatus;
	showWorkflow: boolean;
	workflowStatus: WorkflowStatus | '';
	notes: string;
	autoFilledEnd: boolean;
}

export interface RatingSchemeEntryDraftView {
	reportTypeOptions: ReportTypeOption[];
	evalTypeLabel: string;
	reportTypeLabel: string;
	statusLabel: string;
	eaWarning: string | null;
	filteredWorkflowOptions: typeof WORKFLOW_STATUS_OPTIONS;
	workflowStatusLabel: string;
	missingRequiredLabels: string[];
	canSave: boolean;
}

function evaluatorDraft(
	personId: string | null | undefined,
	name: string | null | undefined
): RatingSchemeEvaluatorDraft {
	return {
		mode: personId ? 'internal' : name ? 'external' : 'internal',
		personId: personId ?? '',
		name: name ?? ''
	};
}

export function createRatingSchemeEntryDraft(entry: RatingSchemeEntry | null): RatingSchemeEntryDraft {
	return {
		ratedPersonId: entry?.ratedPersonId ?? '',
		evalType: entry?.evalType ?? 'NCOER',
		reportType: entry?.reportType ?? '',
		rater: evaluatorDraft(entry?.raterPersonId, entry?.raterName),
		seniorRater: evaluatorDraft(entry?.seniorRaterPersonId, entry?.seniorRaterName),
		showIntermediate: !!(entry?.intermediateRaterPersonId || entry?.intermediateRaterName),
		intermediateRater: evaluatorDraft(entry?.intermediateRaterPersonId, entry?.intermediateRaterName),
		showReviewer: !!(entry?.reviewerPersonId || entry?.reviewerName),
		reviewer: evaluatorDraft(entry?.reviewerPersonId, entry?.reviewerName),
		ratingPeriodStart: entry?.ratingPeriodStart ?? '',
		ratingPeriodEnd: entry?.ratingPeriodEnd ?? '',
		status: entry?.status ?? 'active',
		showWorkflow: !!entry?.workflowStatus,
		workflowStatus: entry?.workflowStatus ?? '',
		notes: entry?.notes ?? '',
		autoFilledEnd: false
	};
}

export function applyRatedPersonToNewRatingSchemeEntryDraft(
	draft: RatingSchemeEntryDraft,
	entry: RatingSchemeEntry | null,
	personnel: PersonnelLookup[]
): void {
	if (entry || !draft.ratedPersonId) return;
	const person = personnel.find((p) => p.id === draft.ratedPersonId);
	if (person) draft.evalType = getEvalTypeForRank(person.rank);
}

export function syncReportTypeForRatingSchemeEntryDraft(draft: RatingSchemeEntryDraft): void {
	const reportTypeOptions = getReportTypesForEvalType(draft.evalType);
	if (draft.reportType && !reportTypeOptions.some((option) => option.value === draft.reportType)) {
		draft.reportType = '';
	}
}

export function syncAnnualThruDateForRatingSchemeEntryDraft(
	draft: RatingSchemeEntryDraft,
	entry: RatingSchemeEntry | null
): void {
	if (
		!entry &&
		draft.reportType === 'AN' &&
		draft.ratingPeriodStart &&
		(!draft.ratingPeriodEnd || draft.autoFilledEnd)
	) {
		const calculated = calculateThruDate('AN', draft.ratingPeriodStart);
		if (calculated) {
			draft.ratingPeriodEnd = calculated;
			draft.autoFilledEnd = true;
		}
	}
	if (draft.reportType !== 'AN') draft.autoFilledEnd = false;
}

export function removeIntermediateRaterFromDraft(draft: RatingSchemeEntryDraft): void {
	draft.showIntermediate = false;
	draft.intermediateRater.personId = '';
	draft.intermediateRater.name = '';
	if (draft.workflowStatus === 'with-intermediate-rater' || draft.workflowStatus === 'ir-signed') {
		draft.workflowStatus = '';
	}
}

export function removeReviewerFromDraft(draft: RatingSchemeEntryDraft): void {
	draft.showReviewer = false;
	draft.reviewer.personId = '';
	draft.reviewer.name = '';
	if (draft.workflowStatus === 'with-reviewer' || draft.workflowStatus === 'reviewer-signed') {
		draft.workflowStatus = '';
	}
}

export function removeWorkflowFromDraft(draft: RatingSchemeEntryDraft): void {
	draft.showWorkflow = false;
	draft.workflowStatus = '';
}

export function getRatingSchemeEntryDraftView(draft: RatingSchemeEntryDraft): RatingSchemeEntryDraftView {
	const reportTypeOptions = getReportTypesForEvalType(draft.evalType);
	const reportTypeLabel = draft.reportType
		? (reportTypeOptions.find((option) => option.value === draft.reportType)?.label ?? draft.reportType)
		: 'Select report type...';
	const filteredWorkflowOptions = getFilteredWorkflowOptions(draft);
	const workflowStatusLabel = draft.workflowStatus
		? (filteredWorkflowOptions.find((option) => option.value === draft.workflowStatus)?.label ?? draft.workflowStatus)
		: 'Select workflow step...';
	const missingRequiredLabels = getMissingRequiredLabels(draft);

	return {
		reportTypeOptions,
		evalTypeLabel: evalTypeLabel(draft.evalType),
		reportTypeLabel,
		statusLabel: statusLabel(draft.status),
		eaWarning: getExtendedAnnualWarning(
			draft.reportType || null,
			draft.evalType,
			draft.ratingPeriodStart,
			draft.ratingPeriodEnd
		),
		filteredWorkflowOptions,
		workflowStatusLabel,
		missingRequiredLabels,
		canSave: missingRequiredLabels.length === 0
	};
}

export function buildRatingSchemeEntrySaveData(draft: RatingSchemeEntryDraft): RatingSchemeEntrySaveData {
	return {
		ratedPersonId: draft.ratedPersonId,
		evalType: draft.evalType,
		raterPersonId: draft.rater.mode === 'internal' ? draft.rater.personId || null : null,
		raterName: draft.rater.mode === 'external' ? draft.rater.name.trim() || null : null,
		seniorRaterPersonId: draft.seniorRater.mode === 'internal' ? draft.seniorRater.personId || null : null,
		seniorRaterName: draft.seniorRater.mode === 'external' ? draft.seniorRater.name.trim() || null : null,
		intermediateRaterPersonId:
			draft.showIntermediate && draft.intermediateRater.mode === 'internal'
				? draft.intermediateRater.personId || null
				: null,
		intermediateRaterName:
			draft.showIntermediate && draft.intermediateRater.mode === 'external'
				? draft.intermediateRater.name.trim() || null
				: null,
		reviewerPersonId: draft.showReviewer && draft.reviewer.mode === 'internal' ? draft.reviewer.personId || null : null,
		reviewerName: draft.showReviewer && draft.reviewer.mode === 'external' ? draft.reviewer.name.trim() || null : null,
		ratingPeriodStart: draft.ratingPeriodStart,
		ratingPeriodEnd: draft.ratingPeriodEnd,
		status: draft.status,
		notes: draft.notes.trim() || null,
		reportType: draft.reportType || null,
		workflowStatus: draft.showWorkflow && draft.workflowStatus ? draft.workflowStatus : null
	};
}

function getFilteredWorkflowOptions(draft: RatingSchemeEntryDraft): typeof WORKFLOW_STATUS_OPTIONS {
	const hasIntermediateRater =
		draft.showIntermediate && !!(draft.intermediateRater.personId || draft.intermediateRater.name.trim());
	const hasReviewer = draft.showReviewer && !!(draft.reviewer.personId || draft.reviewer.name.trim());
	return WORKFLOW_STATUS_OPTIONS.filter((option) => {
		if (option.value === 'with-intermediate-rater' || option.value === 'ir-signed') return hasIntermediateRater;
		if (option.value === 'with-reviewer' || option.value === 'reviewer-signed') return hasReviewer;
		return true;
	});
}

function getMissingRequiredLabels(draft: RatingSchemeEntryDraft): string[] {
	const missing: string[] = [];
	if (!draft.ratedPersonId) missing.push('rated individual');
	if (draft.rater.mode === 'internal' ? !draft.rater.personId : !draft.rater.name.trim()) missing.push('rater');
	if (draft.seniorRater.mode === 'internal' ? !draft.seniorRater.personId : !draft.seniorRater.name.trim()) {
		missing.push('senior rater');
	}
	if (!draft.ratingPeriodStart) missing.push('rating period start');
	if (!draft.ratingPeriodEnd) missing.push('thru date');
	return missing;
}

function evalTypeLabel(evalType: RatingSchemeEntryEvalType): string {
	if (evalType === 'OER') return 'OER (Officer)';
	if (evalType === 'WOER') return 'WOER (Warrant Officer)';
	return 'NCOER (NCO)';
}

function statusLabel(status: RatingSchemeEntryStatus): string {
	if (status === 'completed') return 'Completed';
	if (status === 'change-of-rater') return 'Change of Rater';
	return 'Active';
}
