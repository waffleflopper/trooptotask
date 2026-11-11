import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WorkflowStatus } from '../rating-scheme.types';
import {
	isWorkflowMoveAllowed,
	parseWorkflowStatus,
	WORKFLOW_STEPS,
	workflowMoves,
	workflowRoles,
	type WorkflowRoles
} from './evaluationWorkflow';

// The database test owns the move table; reading it here keeps the client and the database from drifting apart.
const sql = readFileSync(new URL('../../../../supabase/tests/rating_scheme_lifecycle.sql', import.meta.url), 'utf8');
const block = /INSERT INTO matrix \(roles, from_step, allowed\) VALUES\n([\s\S]*?);\n/.exec(sql)?.[1] ?? '';
const rowPattern = /^\s*\('(\w+)', '([^']+)', ARRAY\[([^\]]*)\]\),?$/;

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

const rows = block.split('\n').map((line) => {
	const match = rowPattern.exec(line);
	if (!match) throw new Error(`Unreadable lifecycle row: ${line}`);
	const [, roles, from, allowed] = match;
	return { roles, from, allowed: allowed.split(',').map((label) => step(label.trim().replace(/'/g, ''))) };
});

describe('evaluation workflow moves', () => {
	it('reads the lifecycle table from the database test', () => {
		expect(rows.length).toBeGreaterThan(0);
	});

	it.each(rows)('offers exactly the database moves for $roles evaluators at $from', ({ roles, from, allowed }) => {
		const fromStep = step(from);
		const offered = workflowMoves(fromStep, ROLES[roles]).map((move) => move.to);
		expect(new Set(offered)).toEqual(new Set(allowed));
		for (const target of [null, ...WORKFLOW_STEPS]) {
			if (target === fromStep) continue;
			expect(isWorkflowMoveAllowed(fromStep, target, ROLES[roles])).toBe(allowed.includes(target));
		}
	});

	it('treats a blank evaluator name as no evaluator', () => {
		expect(ROLES.legacy).toEqual({ intermediateRater: false, reviewer: false });
		expect(
			workflowRoles({
				intermediateRaterPersonId: null,
				intermediateRaterName: 'LTC Named',
				reviewerPersonId: 'reviewer-1',
				reviewerName: null
			})
		).toEqual({ intermediateRater: true, reviewer: true });
	});

	it('refuses a stored value outside the lifecycle', () => {
		expect(parseWorkflowStatus(null)).toBeNull();
		expect(parseWorkflowStatus('sr-signed')).toBe('sr-signed');
		expect(() => parseWorkflowStatus('active')).toThrow();
	});
});
