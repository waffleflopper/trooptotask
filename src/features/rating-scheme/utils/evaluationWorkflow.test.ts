import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_STEPS, type WorkflowStatus } from '../rating-scheme.types';
import {
	isWorkflowMoveAllowed,
	parseWorkflowStatus,
	waitingOn,
	workflowJumpTargets,
	workflowMoves,
	workflowRoles,
	type WorkflowRoles
} from './evaluationWorkflow';

// The database test owns the rule; reading it here keeps the client and the database from drifting apart.
const sql = readFileSync(new URL('../../../../supabase/tests/rating_scheme_lifecycle.sql', import.meta.url), 'utf8');
const block = /INSERT INTO refusals \(roles, from_steps, refused\) VALUES\n([\s\S]*?);\n/.exec(sql)?.[1] ?? '';
const rowPattern = /\('(\w+)', ARRAY\[([^\]]*)\](?:::text\[\])?,\s*ARRAY\[([^\]]*)\](?:::text\[\])?\)/g;

const ROLES: Record<string, WorkflowRoles> = {
	none: { intermediateRater: false, reviewer: false },
	both: { intermediateRater: true, reviewer: true },
	reviewer: { intermediateRater: false, reviewer: true },
	legacy: workflowRoles({
		intermediateRaterPersonId: null,
		intermediateRaterName: '  ',
		reviewerPersonId: null,
		reviewerName: null
	})
};

const step = (label: string): WorkflowStatus | null => (label === 'not tracked' ? null : parseWorkflowStatus(label));
const steps = (labels: string) =>
	labels
		.split(',')
		.map((label) => label.trim().replace(/'/g, ''))
		.filter(Boolean)
		.map(step);

// Each database row is a group of starting steps that refuse the same targets.
const rows = [...block.matchAll(rowPattern)].map(([, roles, from, refused]) => ({
	roles,
	from: steps(from),
	refused: steps(refused)
}));
const everyStart = [null, ...WORKFLOW_STEPS.map((workflowStep) => workflowStep.value)];

describe('evaluation workflow moves', () => {
	it('reads the lifecycle rule from the database test', () => {
		expect(rows.map((row) => row.roles)).toEqual(['none', 'none', 'both', 'both', 'reviewer', 'reviewer', 'legacy']);
	});

	it.each(rows)('allows exactly the database moves for $roles evaluators', ({ roles, from, refused }) => {
		for (const fromStep of from) {
			for (const target of everyStart) {
				expect(isWorkflowMoveAllowed(fromStep, target, ROLES[roles]), `${fromStep} to ${target}`).toBe(
					target !== fromStep && !refused.includes(target)
				);
			}
		}
	});

	it.each(['none', 'both', 'reviewer'])('states a rule for every step a %s entry can sit at', (roles) => {
		const covered = rows.filter((row) => row.roles === roles).flatMap((row) => row.from);
		const present = everyStart.filter((start) => {
			const role = WORKFLOW_STEPS.find((workflowStep) => workflowStep.value === start)?.role;
			return !role || ROLES[roles][role];
		});
		expect(new Set(covered)).toEqual(new Set(present));
	});

	it('offers the buttons the database allows, one present step at a time', () => {
		for (const row of rows) {
			for (const fromStep of row.from) {
				for (const move of workflowMoves(fromStep, ROLES[row.roles])) {
					expect(isWorkflowMoveAllowed(fromStep, move.to, ROLES[row.roles])).toBe(true);
				}
			}
		}
	});

	it('walks Back and Next past Command Review and offers it from drafting', () => {
		const roles = ROLES.none;
		expect(workflowMoves('drafting', roles)).toEqual([
			{ kind: 'stop', to: null },
			{ kind: 'review', to: 'command-review' },
			{ kind: 'next', to: 'with-rater' }
		]);
		expect(workflowMoves('command-review', roles)).toEqual([
			{ kind: 'back', to: 'drafting' },
			{ kind: 'next', to: 'with-rater' }
		]);
		expect(workflowMoves('with-rater', roles)).toEqual([
			{ kind: 'back', to: 'drafting' },
			{ kind: 'next', to: 'rater-signed' }
		]);
	});

	it('skips the steps of an absent evaluator', () => {
		expect(workflowMoves('rater-signed', ROLES.none)).toEqual([
			{ kind: 'back', to: 'with-rater' },
			{ kind: 'next', to: 'with-senior-rater' }
		]);
		expect(workflowMoves('rater-signed', ROLES.both)).toEqual([
			{ kind: 'back', to: 'with-rater' },
			{ kind: 'next', to: 'with-intermediate-rater' }
		]);
		expect(workflowMoves('with-intermediate-rater', ROLES.legacy)).toEqual([
			{ kind: 'back', to: 'rater-signed' },
			{ kind: 'next', to: 'with-senior-rater' }
		]);
	});

	it('keeps starting, completing and reopening outside the chain', () => {
		expect(workflowMoves(null, ROLES.none)).toEqual([
			{ kind: 'start', to: 'drafting' },
			{ kind: 'complete', to: 'completed' }
		]);
		expect(workflowMoves('completed', ROLES.none)).toEqual([
			{ kind: 'back', to: 'submitted-to-hrc' },
			{ kind: 'reopen', to: null }
		]);
	});

	it('lists every present step but the current one as a jump target, in chain order', () => {
		expect(workflowJumpTargets('sm-signed', ROLES.none).map((target) => target.value)).toEqual([
			'drafting',
			'command-review',
			'with-rater',
			'rater-signed',
			'with-senior-rater',
			'sr-signed',
			'with-rated-soldier',
			'submitted-to-hrc',
			'completed'
		]);
		expect(workflowJumpTargets(null, ROLES.reviewer).map((target) => target.label)).toContain('With Reviewer');
		expect(workflowJumpTargets(null, ROLES.reviewer).map((target) => target.label)).not.toContain('IR Signed');
		expect(workflowJumpTargets('command-review', ROLES.both)).toHaveLength(13);
	});

	it('counts an evaluator the way the database does', () => {
		expect(ROLES.legacy).toEqual({ intermediateRater: false, reviewer: false });
		expect(
			workflowRoles({
				intermediateRaterPersonId: null,
				intermediateRaterName: 'LTC Named',
				reviewerPersonId: 'reviewer-1',
				reviewerName: null
			})
		).toEqual({ intermediateRater: true, reviewer: true });
		expect(
			workflowRoles({
				intermediateRaterPersonId: null,
				intermediateRaterName: '\t',
				reviewerPersonId: null,
				reviewerName: '\n'
			})
		).toEqual({ intermediateRater: true, reviewer: true });
	});

	it('refuses a stored value outside the lifecycle', () => {
		expect(parseWorkflowStatus(null)).toBeNull();
		expect(parseWorkflowStatus('sr-signed')).toBe('sr-signed');
		expect(() => parseWorkflowStatus('active')).toThrow();
		expect(() => parseWorkflowStatus('submitted-to-s1')).toThrow();
	});
});

describe('who an Evaluation waits on', () => {
	it.each([
		['drafting', 'none', 'rater'],
		['command-review', 'none', 'command'],
		['rater-signed', 'none', 'seniorRater'],
		['rater-signed', 'both', 'intermediateRater'],
		['ir-signed', 'both', 'seniorRater'],
		['sr-signed', 'none', 'rated'],
		['sr-signed', 'reviewer', 'reviewer'],
		['reviewer-signed', 'reviewer', 'rated'],
		['sm-signed', 'none', 'hrc'],
		['submitted-to-hrc', 'none', 'hrc']
	] as const)('%s with %s roles waits on the %s', (status, roles, role) => {
		expect(waitingOn(status, ROLES[roles])).toBe(role);
	});

	it('waits on no one before tracking starts or once completed', () => {
		expect(waitingOn(null, ROLES.none)).toBeNull();
		expect(waitingOn('completed', ROLES.none)).toBeNull();
	});
});
