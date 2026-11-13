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

interface WorkflowStepRecord {
	value: string;
	label: string;
	color: string;
	/** Which of the five progress phases the step belongs to. */
	phase: 1 | 2 | 3 | 4 | 5;
	/** The evaluator the step waits on; the step is absent from an entry that has no one in that role. */
	role?: 'intermediateRater' | 'reviewer';
	/** An optional step is offered by its own button and skipped by Back and Next. */
	optional?: true;
}

/** The Evaluation lifecycle in chain order. `null` is "Not tracked" and sits outside the chain. */
const STEP_RECORDS = [
	{ value: 'drafting', label: 'Drafting', color: '#6b7280', phase: 1 },
	{ value: 'command-review', label: 'Command Review', color: '#0ea5e9', phase: 1, optional: true },
	{ value: 'with-rater', label: 'With Rater', color: '#3b82f6', phase: 2 },
	{ value: 'rater-signed', label: 'Rater Signed', color: '#22c55e', phase: 2 },
	{
		value: 'with-intermediate-rater',
		label: 'With Intermediate Rater',
		color: '#3b82f6',
		phase: 3,
		role: 'intermediateRater'
	},
	{ value: 'ir-signed', label: 'IR Signed', color: '#22c55e', phase: 3, role: 'intermediateRater' },
	{ value: 'with-senior-rater', label: 'With Senior Rater', color: '#3b82f6', phase: 3 },
	{ value: 'sr-signed', label: 'SR Signed', color: '#22c55e', phase: 3 },
	{ value: 'with-reviewer', label: 'With Reviewer', color: '#3b82f6', phase: 4, role: 'reviewer' },
	{ value: 'reviewer-signed', label: 'Reviewer Signed', color: '#22c55e', phase: 4, role: 'reviewer' },
	{ value: 'with-rated-soldier', label: 'With Rated Soldier', color: '#8b5cf6', phase: 4 },
	{ value: 'sm-signed', label: 'SM Signed', color: '#22c55e', phase: 4 },
	{ value: 'submitted-to-hrc', label: 'Submitted to HRC', color: '#f59e0b', phase: 5 },
	{ value: 'completed', label: 'Completed', color: '#059669', phase: 5 }
] as const satisfies readonly WorkflowStepRecord[];

export type WorkflowStatus = (typeof STEP_RECORDS)[number]['value'];

export interface WorkflowStep extends WorkflowStepRecord {
	value: WorkflowStatus;
}

export const WORKFLOW_STEPS: readonly WorkflowStep[] = STEP_RECORDS;

export type EvalType = 'OER' | 'NCOER' | 'WOER';

/** Who rates a Soldier: each role is a Personnel Record or an external name. */
export interface EvaluatorChain {
	raterPersonId: string | null;
	raterName: string | null;
	seniorRaterPersonId: string | null;
	seniorRaterName: string | null;
	intermediateRaterPersonId: string | null;
	intermediateRaterName: string | null;
	reviewerPersonId: string | null;
	reviewerName: string | null;
}

/** A Rated Individual's standing rating chain. At most one per person is listed (archivedAt null). */
export interface RatingScheme extends EvaluatorChain {
	id: string;
	ratedPersonId: string;
	evalType: EvalType;
	notes: string | null;
	archivedAt: string | null;
}

/** One rating period on a rating scheme with its workflow step. */
export interface Evaluation {
	id: string;
	ratingSchemeId: string;
	ratedPersonId: string;
	evalType: EvalType;
	reportType: ReportType | null;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
	workflowStatus: WorkflowStatus | null;
	notes: string | null;
	/** The chain that signed it; null while it follows its scheme's current chain. */
	signedChain: EvaluatorChain | null;
}

/** One Evaluation as the Evals page lists it, with the chain it shows and its scheme's listing. */
export interface RatingSchemeEntry extends EvaluatorChain {
	id: string;
	ratingSchemeId: string;
	ratedPersonId: string;
	evalType: EvalType;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
	notes: string | null;
	reportType: ReportType | null;
	workflowStatus: WorkflowStatus | null;
	/** When the rating scheme was archived; null while it is listed. Independent of the step. */
	archivedAt: string | null;
	/** True when the chain shown is the one that signed the Evaluation, so scheme edits no longer change it. */
	chainSigned: boolean;
}

export interface EvaluationPhase {
	/** 0 when the evaluation is not tracked. */
	step: 0 | 1 | 2 | 3 | 4 | 5;
	label: string;
}

/** The rated Person's newest noncompleted evaluation, with evaluator display names resolved. */
export interface PersonnelActiveEvaluation {
	evaluationId: string;
	evalType: EvalType;
	reportType: ReportType | null;
	reportTypeLabel: string | null;
	periodStart: string;
	periodEnd: string;
	daysUntilThru: number;
	dueStatus: RatingDueStatus;
	workflowStatus: WorkflowStatus | null;
	phase: EvaluationPhase;
	rater: string | null;
	seniorRater: string | null;
	intermediateRater: string | null;
	reviewer: string | null;
}

export type RatingDueStatus = 'current' | 'due-60' | 'due-30' | 'overdue' | 'completed';

export const RATING_STATUS_COLORS: Record<RatingDueStatus, string> = {
	current: '#22c55e',
	'due-60': '#eab308',
	'due-30': '#f97316',
	overdue: '#ef4444',
	completed: '#6b7280'
};
