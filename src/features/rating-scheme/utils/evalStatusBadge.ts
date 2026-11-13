import type { Evaluation, RatingDueStatus } from '../rating-scheme.types';
import { evaluationPhase, EVALUATION_PHASE_COUNT } from './evaluationWorkflow';
import { getRatingDueLabel, getReportTypeLabel } from './ratingScheme';
import { isEvaluationOpen } from './ratingSchemeEntries';

export interface EvalStatusBadgeView {
	evaluationId: string;
	/** Filled segments of the five-phase meter. */
	step: number;
	stepCount: number;
	/** The current workflow step, such as With Senior Rater. */
	label: string;
	/** Thru urgency, only once the thru date is within 60 days or has passed; null before then and once the Evaluation is at HRC. */
	thru: { text: string; status: Exclude<RatingDueStatus, 'current' | 'completed'> } | null;
	/** What the Evaluation is, for the hover detail. */
	title: string;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
}

/** What a scheme line shows of its open Evaluation: a small read-only badge. Not tracked and completed show nothing. */
export function evalStatusBadge(evaluation: Evaluation | null, today: Date = new Date()): EvalStatusBadgeView | null {
	if (!evaluation || !isEvaluationOpen(evaluation.workflowStatus)) return null;
	const phase = evaluationPhase(evaluation.workflowStatus);
	const due =
		evaluation.workflowStatus === 'submitted-to-hrc'
			? null
			: getRatingDueLabel(evaluation.ratingPeriodEnd, evaluation.workflowStatus, today);
	return {
		evaluationId: evaluation.id,
		step: phase.step,
		stepCount: EVALUATION_PHASE_COUNT,
		label: phase.label,
		thru:
			due && (due.status === 'overdue' || due.status === 'due-30' || due.status === 'due-60')
				? { text: due.text, status: due.status }
				: null,
		title: [getReportTypeLabel(evaluation.reportType, evaluation.evalType), evaluation.evalType]
			.filter(Boolean)
			.join(' '),
		ratingPeriodStart: evaluation.ratingPeriodStart,
		ratingPeriodEnd: evaluation.ratingPeriodEnd
	};
}
