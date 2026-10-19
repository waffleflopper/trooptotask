import { WORKFLOW_STATUS_OPTIONS, type EvaluationPhase, type WorkflowStatus } from '../rating-scheme.types';

export const EVALUATION_PHASE_COUNT = 5;

const PHASE_BY_STATUS: Record<WorkflowStatus, 1 | 2 | 3 | 4 | 5> = {
	drafting: 1,
	'with-rater': 2,
	'rater-signed': 2,
	'with-senior-rater': 3,
	'sr-signed': 3,
	'with-intermediate-rater': 3,
	'ir-signed': 3,
	'with-reviewer': 4,
	'reviewer-signed': 4,
	'with-rated-soldier': 4,
	'sm-signed': 4,
	'submitted-to-s1': 5,
	completed: 5
};

/** Maps the thirteen workflow statuses onto five phases: drafting, rater, senior or intermediate rater, reviewer and Soldier, submitted. */
export function evaluationPhase(status: WorkflowStatus | null): EvaluationPhase {
	if (!status) return { step: 0, label: 'Not started' };
	const label = WORKFLOW_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
	return { step: PHASE_BY_STATUS[status], label };
}
