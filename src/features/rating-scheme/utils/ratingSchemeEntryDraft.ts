import type { PersonnelLookup } from '$features/personnel/contracts';
import { WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
import type { RatingSchemeEntry, ReportType, ReportTypeOption, WorkflowStatus } from '../rating-scheme.types';
import {
	calculateThruDate,
	getEvalTypeForRank,
	getExtendedAnnualWarning,
	getReportTypesForEvalType
} from './ratingScheme';

export type EvaluatorDraft =
	| { kind: 'empty' }
	| { kind: 'person'; personId: string }
	| { kind: 'external'; name: string };
export type RatingSchemeRequiredField =
	| 'ratedPerson'
	| 'ratingPeriodStart'
	| 'ratingPeriodEnd'
	| 'rater'
	| 'seniorRater';
export type RatingSchemeEntryEvalType = RatingSchemeEntry['evalType'];
export type RatingSchemeEntryStatus = RatingSchemeEntry['status'];
export type RatingSchemeEntrySaveData = Omit<RatingSchemeEntry, 'id'>;

export interface RatingSchemeEntryDraft {
	ratedPersonId: string;
	evalType: RatingSchemeEntryEvalType;
	reportType: ReportType | '';
	rater: EvaluatorDraft;
	seniorRater: EvaluatorDraft;
	showIntermediate: boolean;
	intermediateRater: EvaluatorDraft;
	showReviewer: boolean;
	reviewer: EvaluatorDraft;
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
	reportTypeLabel: string;
	eaWarning: string | null;
	filteredWorkflowOptions: typeof WORKFLOW_STATUS_OPTIONS;
	workflowStatusLabel: string;
	missingRequired: RatingSchemeRequiredField[];
	canSave: boolean;
}

function evaluatorDraft(personId: string | null | undefined, name: string | null | undefined): EvaluatorDraft {
	if (personId) return { kind: 'person', personId };
	if (name) return { kind: 'external', name };
	return { kind: 'empty' };
}

export function setEvaluatorFromPicker(value: { personId: string } | { externalName: string } | null): EvaluatorDraft {
	if (!value) return { kind: 'empty' };
	if ('personId' in value) return value.personId ? { kind: 'person', personId: value.personId } : { kind: 'empty' };
	const name = value.externalName.trim();
	return name ? { kind: 'external', name } : { kind: 'empty' };
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
	draft.intermediateRater = { kind: 'empty' };
	if (draft.workflowStatus === 'with-intermediate-rater' || draft.workflowStatus === 'ir-signed') {
		draft.workflowStatus = '';
	}
}

export function removeReviewerFromDraft(draft: RatingSchemeEntryDraft): void {
	draft.showReviewer = false;
	draft.reviewer = { kind: 'empty' };
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
	const missingRequired = getMissingRequired(draft);

	return {
		reportTypeOptions,
		reportTypeLabel,
		eaWarning: getExtendedAnnualWarning(
			draft.reportType || null,
			draft.evalType,
			draft.ratingPeriodStart,
			draft.ratingPeriodEnd
		),
		filteredWorkflowOptions,
		workflowStatusLabel,
		missingRequired,
		canSave: missingRequired.length === 0
	};
}

export function buildRatingSchemeEntrySaveData(draft: RatingSchemeEntryDraft): RatingSchemeEntrySaveData {
	return {
		ratedPersonId: draft.ratedPersonId,
		evalType: draft.evalType,
		raterPersonId: draft.rater.kind === 'person' ? draft.rater.personId || null : null,
		raterName: draft.rater.kind === 'external' ? draft.rater.name.trim() || null : null,
		seniorRaterPersonId: draft.seniorRater.kind === 'person' ? draft.seniorRater.personId || null : null,
		seniorRaterName: draft.seniorRater.kind === 'external' ? draft.seniorRater.name.trim() || null : null,
		intermediateRaterPersonId:
			draft.showIntermediate && draft.intermediateRater.kind === 'person'
				? draft.intermediateRater.personId || null
				: null,
		intermediateRaterName:
			draft.showIntermediate && draft.intermediateRater.kind === 'external'
				? draft.intermediateRater.name.trim() || null
				: null,
		reviewerPersonId: draft.showReviewer && draft.reviewer.kind === 'person' ? draft.reviewer.personId || null : null,
		reviewerName: draft.showReviewer && draft.reviewer.kind === 'external' ? draft.reviewer.name.trim() || null : null,
		ratingPeriodStart: draft.ratingPeriodStart,
		ratingPeriodEnd: draft.ratingPeriodEnd,
		status: draft.status,
		notes: draft.notes.trim() || null,
		reportType: draft.reportType || null,
		workflowStatus: draft.showWorkflow && draft.workflowStatus ? draft.workflowStatus : null
	};
}

function getFilteredWorkflowOptions(draft: RatingSchemeEntryDraft): typeof WORKFLOW_STATUS_OPTIONS {
	const hasIntermediateRater = draft.showIntermediate && hasEvaluator(draft.intermediateRater);
	const hasReviewer = draft.showReviewer && hasEvaluator(draft.reviewer);
	return WORKFLOW_STATUS_OPTIONS.filter((option) => {
		if (option.value === 'with-intermediate-rater' || option.value === 'ir-signed') return hasIntermediateRater;
		if (option.value === 'with-reviewer' || option.value === 'reviewer-signed') return hasReviewer;
		return true;
	});
}

function hasEvaluator(evaluator: EvaluatorDraft): boolean {
	return evaluator.kind === 'person' || (evaluator.kind === 'external' && !!evaluator.name.trim());
}

function getMissingRequired(draft: RatingSchemeEntryDraft): RatingSchemeRequiredField[] {
	const missing: RatingSchemeRequiredField[] = [];
	if (!draft.ratedPersonId) missing.push('ratedPerson');
	if (!draft.ratingPeriodStart) missing.push('ratingPeriodStart');
	if (!draft.ratingPeriodEnd) missing.push('ratingPeriodEnd');
	if (!hasEvaluator(draft.rater)) missing.push('rater');
	if (!hasEvaluator(draft.seniorRater)) missing.push('seniorRater');
	return missing;
}
