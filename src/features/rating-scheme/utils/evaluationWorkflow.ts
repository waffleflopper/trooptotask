import {
	WORKFLOW_STEPS,
	type EvaluationPhase,
	type RatingSchemeEntry,
	type WorkflowStatus,
	type WorkflowStep
} from '../rating-scheme.types';

export const EVALUATION_PHASE_COUNT = 5;

const STEP_BY_VALUE = new Map(WORKFLOW_STEPS.map((step) => [step.value, step]));

export interface WorkflowRoles {
	intermediateRater: boolean;
	reviewer: boolean;
}

export type WorkflowMoveKind = 'start' | 'complete' | 'stop' | 'reopen' | 'back' | 'review' | 'next';

export interface WorkflowMove {
	kind: WorkflowMoveKind;
	to: WorkflowStatus | null;
}

export function isEvaluationCompleted(workflowStatus: WorkflowStatus | null): boolean {
	return workflowStatus === 'completed';
}

export function parseWorkflowStatus(value: unknown): WorkflowStatus | null {
	if (value === null || value === undefined) return null;
	const step = typeof value === 'string' ? WORKFLOW_STEPS.find((candidate) => candidate.value === value) : undefined;
	if (step) return step.value;
	throw new Error(`Unknown evaluation step: ${String(value)}`);
}

export function workflowStatusLabel(workflowStatus: WorkflowStatus | null): string {
	if (!workflowStatus) return 'Not tracked';
	return STEP_BY_VALUE.get(workflowStatus)?.label ?? workflowStatus;
}

/** Maps the fourteen steps onto five phases: drafting, rater, senior or intermediate rater, reviewer and Soldier, submitted. */
export function evaluationPhase(workflowStatus: WorkflowStatus | null): EvaluationPhase {
	if (!workflowStatus) return { step: 0, label: 'Not tracked' };
	return { step: STEP_BY_VALUE.get(workflowStatus)!.phase, label: workflowStatusLabel(workflowStatus) };
}

// Matches the database's btrim, which strips spaces only, so a tab-only name still counts as an evaluator.
const hasRole = (personId: string | null, name: string | null) => personId !== null || /[^ ]/.test(name ?? '');

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

function isPresentStep(step: WorkflowStep, roles: WorkflowRoles): boolean {
	return !step.role || roles[step.role];
}

/** The steps an entry's evaluators make possible, in chain order. */
function presentSteps(roles: WorkflowRoles): WorkflowStep[] {
	return WORKFLOW_STEPS.filter((step) => isPresentStep(step, roles));
}

/** Where the Jump to step control can send an entry: every present step but the one it is on, in chain order. */
export function workflowJumpTargets(workflowStatus: WorkflowStatus | null, roles: WorkflowRoles): WorkflowStep[] {
	return presentSteps(roles).filter((step) => step.value !== workflowStatus);
}

/**
 * The one-step buttons. Back and Next walk the present steps and skip the optional Command Review, which drafting
 * reaches with its own button. A step left by a removed role still moves to its present neighbours.
 */
export function workflowMoves(workflowStatus: WorkflowStatus | null, roles: WorkflowRoles): WorkflowMove[] {
	if (workflowStatus === null) {
		return [
			{ kind: 'start', to: 'drafting' },
			{ kind: 'complete', to: 'completed' }
		];
	}
	const at = WORKFLOW_STEPS.findIndex((step) => step.value === workflowStatus);
	const walkable = (step: WorkflowStep) => !step.optional && isPresentStep(step, roles);
	const back = WORKFLOW_STEPS.slice(0, at).findLast(walkable);
	const next = WORKFLOW_STEPS.slice(at + 1).find(walkable);
	const moves: WorkflowMove[] = [];
	if (back) moves.push({ kind: 'back', to: back.value });
	if (workflowStatus === 'drafting') {
		moves.push({ kind: 'stop', to: null }, { kind: 'review', to: 'command-review' });
	}
	if (next) moves.push({ kind: 'next', to: next.value });
	if (workflowStatus === 'completed') moves.push({ kind: 'reopen', to: null });
	return moves;
}

/** Any step to any present step; Not tracked is reachable only from drafting or completed. The database enforces the same rule. */
export function isWorkflowMoveAllowed(
	from: WorkflowStatus | null,
	to: WorkflowStatus | null,
	roles: WorkflowRoles
): boolean {
	if (from === to) return false;
	if (to === null) return from === 'drafting' || from === 'completed';
	return isPresentStep(STEP_BY_VALUE.get(to)!, roles);
}

/** Who an Evaluation is with: an evaluator, the rated Soldier, the command, or HRC. */
export type WaitingRole = 'rater' | 'intermediateRater' | 'seniorRater' | 'reviewer' | 'rated' | 'command' | 'hrc';

/** The step's holder. A signed step has none of its own and waits on whoever the next step hands it to. */
const STEP_HOLDER: Partial<Record<WorkflowStatus, WaitingRole>> = {
	drafting: 'rater',
	'command-review': 'command',
	'with-rater': 'rater',
	'with-intermediate-rater': 'intermediateRater',
	'with-senior-rater': 'seniorRater',
	'with-reviewer': 'reviewer',
	'with-rated-soldier': 'rated',
	'submitted-to-hrc': 'hrc'
};

export function waitingOn(workflowStatus: WorkflowStatus | null, roles: WorkflowRoles): WaitingRole | null {
	if (workflowStatus === null || workflowStatus === 'completed') return null;
	const holder = STEP_HOLDER[workflowStatus];
	if (holder) return holder;
	const next = workflowMoves(workflowStatus, roles).find((move) => move.kind === 'next')?.to ?? null;
	return waitingOn(next, roles);
}

/** The steps the chain an Evaluation shows makes possible, in chain order, for its step list. */
export function workflowStepList(roles: WorkflowRoles): WorkflowStep[] {
	return presentSteps(roles);
}
