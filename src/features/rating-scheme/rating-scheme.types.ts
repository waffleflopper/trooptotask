// ============================================================
// Rating Scheme
// ============================================================

export type ReportType = 'AN' | 'CR' | 'CTR' | 'RFC' | 'SO' | 'EA' | 'RO';

export interface ReportTypeOption {
	value: ReportType;
	label: string;
}

export const OER_REPORT_TYPES: ReportTypeOption[] = [
	{ value: 'AN', label: 'Annual' },
	{ value: 'CR', label: 'Change of Rater' },
	{ value: 'CTR', label: 'Complete the Record' },
	{ value: 'RFC', label: 'Relief for Cause' },
	{ value: 'SO', label: 'Senior Rater Option' },
	{ value: 'EA', label: 'Extended Annual' }
];

export const NCOER_REPORT_TYPES: ReportTypeOption[] = [
	{ value: 'AN', label: 'Annual' },
	{ value: 'CR', label: 'Change of Rater' },
	{ value: 'CTR', label: 'Complete the Record' },
	{ value: 'RFC', label: 'Relief for Cause' },
	{ value: 'EA', label: 'Extended Annual' },
	{ value: 'RO', label: '60-Day Rater Option' },
	{ value: 'SO', label: '60-Day SR Option' }
];

export const WOER_REPORT_TYPES: ReportTypeOption[] = [
	{ value: 'AN', label: 'Annual' },
	{ value: 'CR', label: 'Change of Rater' },
	{ value: 'CTR', label: 'Complete the Record' },
	{ value: 'RFC', label: 'Relief for Cause' },
	{ value: 'SO', label: 'Senior Rater Option' },
	{ value: 'EA', label: 'Extended Annual' }
];

export type WorkflowStatus =
	| 'drafting'
	| 'with-rater'
	| 'rater-signed'
	| 'with-senior-rater'
	| 'sr-signed'
	| 'with-intermediate-rater'
	| 'ir-signed'
	| 'with-reviewer'
	| 'reviewer-signed'
	| 'with-rated-soldier'
	| 'sm-signed'
	| 'submitted-to-s1'
	| 'completed';

export interface WorkflowStatusOption {
	value: WorkflowStatus;
	label: string;
}

export const WORKFLOW_STATUS_OPTIONS: WorkflowStatusOption[] = [
	{ value: 'drafting', label: 'Drafting' },
	{ value: 'with-rater', label: 'With Rater' },
	{ value: 'rater-signed', label: 'Rater Signed' },
	{ value: 'with-senior-rater', label: 'With Senior Rater' },
	{ value: 'sr-signed', label: 'SR Signed' },
	{ value: 'with-intermediate-rater', label: 'With Intermediate Rater' },
	{ value: 'ir-signed', label: 'IR Signed' },
	{ value: 'with-reviewer', label: 'With Reviewer' },
	{ value: 'reviewer-signed', label: 'Reviewer Signed' },
	{ value: 'with-rated-soldier', label: 'With Rated Soldier' },
	{ value: 'sm-signed', label: 'SM Signed' },
	{ value: 'submitted-to-s1', label: 'Submitted to S1' },
	{ value: 'completed', label: 'Completed' }
];

export const WORKFLOW_STATUS_COLORS: Record<WorkflowStatus, string> = {
	drafting: '#6b7280',
	'with-rater': '#3b82f6',
	'rater-signed': '#22c55e',
	'with-senior-rater': '#3b82f6',
	'sr-signed': '#22c55e',
	'with-intermediate-rater': '#3b82f6',
	'ir-signed': '#22c55e',
	'with-reviewer': '#3b82f6',
	'reviewer-signed': '#22c55e',
	'with-rated-soldier': '#8b5cf6',
	'sm-signed': '#22c55e',
	'submitted-to-s1': '#f59e0b',
	completed: '#059669'
};

export interface RatingSchemeEntry {
	id: string;
	ratedPersonId: string;
	evalType: 'OER' | 'NCOER' | 'WOER';
	raterPersonId: string | null;
	raterName: string | null;
	seniorRaterPersonId: string | null;
	seniorRaterName: string | null;
	intermediateRaterPersonId: string | null;
	intermediateRaterName: string | null;
	reviewerPersonId: string | null;
	reviewerName: string | null;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
	status: 'active' | 'completed' | 'change-of-rater';
	notes: string | null;
	reportType: ReportType | null;
	workflowStatus: WorkflowStatus | null;
}

export type RatingDueStatus = 'current' | 'due-60' | 'due-30' | 'overdue' | 'completed';

export const RATING_STATUS_COLORS: Record<RatingDueStatus, string> = {
	current: '#22c55e',
	'due-60': '#eab308',
	'due-30': '#f97316',
	overdue: '#ef4444',
	completed: '#6b7280'
};
