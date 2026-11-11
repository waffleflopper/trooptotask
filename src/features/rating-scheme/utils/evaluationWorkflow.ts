import {
	WORKFLOW_STATUS_OPTIONS,
	type EvaluationPhase,
	type RatingSchemeEntry,
	type WorkflowStatus
} from '../rating-scheme.types';

/** The stored lifecycle; null is "Not tracked" and counts as open. The database enforces the same moves. */
export const WORKFLOW_STEPS: readonly WorkflowStatus[] = WORKFLOW_STATUS_OPTIONS.map((option) => option.value);

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

const INTERMEDIATE_RATER_STEPS: readonly WorkflowStatus[] = ['with-intermediate-rater', 'ir-signed'];
const REVIEWER_STEPS: readonly WorkflowStatus[] = ['with-reviewer', 'reviewer-signed'];

export interface WorkflowRoles {
	intermediateRater: boolean;
	reviewer: boolean;
}

export type WorkflowMoveKind = 'start' | 'complete' | 'stop' | 'reopen' | 'back' | 'next';

export interface WorkflowMove {
	kind: WorkflowMoveKind;
	to: WorkflowStatus | null;
}

export function isEvaluationCompleted(workflowStatus: WorkflowStatus | null): boolean {
	return workflowStatus === 'completed';
}

export function parseWorkflowStatus(value: unknown): WorkflowStatus | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' && (WORKFLOW_STEPS as readonly string[]).includes(value)) {
		return value as WorkflowStatus;
	}
	throw new Error(`Unknown evaluation step: ${String(value)}`);
}

export function workflowStatusLabel(workflowStatus: WorkflowStatus | null): string {
	if (!workflowStatus) return 'Not tracked';
	return WORKFLOW_STATUS_OPTIONS.find((option) => option.value === workflowStatus)?.label ?? workflowStatus;
}

/** Maps the thirteen steps onto five phases: drafting, rater, senior or intermediate rater, reviewer and Soldier, submitted. */
export function evaluationPhase(workflowStatus: WorkflowStatus | null): EvaluationPhase {
	if (!workflowStatus) return { step: 0, label: 'Not tracked' };
	return { step: PHASE_BY_STATUS[workflowStatus], label: workflowStatusLabel(workflowStatus) };
}

const hasRole = (personId: string | null, name: string | null) => personId !== null || Boolean(name?.trim());

export function workflowRoles(
	entry: Pick<
		RatingSchemeEntry,
		'intermediateRaterPersonId' | 'intermediateRaterName' | 'reviewerPersonId' | 'reviewerName'
	>
): WorkflowRoles {
	return {
		intermediateRater: hasRole(entry.intermediateRaterPersonId, entry.intermediateRaterName),
		reviewer: hasRole(entry.reviewerPersonId, entry.reviewerName)
	};
}

function isPresentStep(step: WorkflowStatus, roles: WorkflowRoles): boolean {
	if (INTERMEDIATE_RATER_STEPS.includes(step)) return roles.intermediateRater;
	if (REVIEWER_STEPS.includes(step)) return roles.reviewer;
	return true;
}

function nearestPresentStep(from: number, direction: 1 | -1, roles: WorkflowRoles): WorkflowStatus | null {
	for (let index = from + direction; index >= 0 && index < WORKFLOW_STEPS.length; index += direction) {
		if (isPresentStep(WORKFLOW_STEPS[index], roles)) return WORKFLOW_STEPS[index];
	}
	return null;
}

/** Every move the lifecycle allows from a step. A step left by a removed role still moves to its present neighbours. */
export function workflowMoves(workflowStatus: WorkflowStatus | null, roles: WorkflowRoles): WorkflowMove[] {
	if (workflowStatus === null) {
		return [
			{ kind: 'start', to: 'drafting' },
			{ kind: 'complete', to: 'completed' }
		];
	}
	const index = WORKFLOW_STEPS.indexOf(workflowStatus);
	const back = nearestPresentStep(index, -1, roles);
	const next = nearestPresentStep(index, 1, roles);
	const moves: WorkflowMove[] = [];
	if (back) moves.push({ kind: 'back', to: back });
	if (workflowStatus === 'drafting') moves.push({ kind: 'stop', to: null });
	if (next) moves.push({ kind: 'next', to: next });
	if (workflowStatus === 'completed') moves.push({ kind: 'reopen', to: null });
	return moves;
}

export function isWorkflowMoveAllowed(
	from: WorkflowStatus | null,
	to: WorkflowStatus | null,
	roles: WorkflowRoles
): boolean {
	return workflowMoves(from, roles).some((move) => move.to === to);
}
