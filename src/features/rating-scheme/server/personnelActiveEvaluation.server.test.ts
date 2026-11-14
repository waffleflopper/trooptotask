import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { Evaluation, RatingScheme } from '../contracts';
import type { WorkflowStatus } from '../rating-scheme.types';
import { evaluationPhase } from '../utils/evaluationWorkflow';
import { loadPersonnelActiveEvaluation } from './personnelActiveEvaluation.server';

const person = { id: 'okafor' } as Personnel;

function scheme(overrides: Partial<RatingScheme> = {}): RatingScheme {
	return {
		id: 'scheme-1',
		ratedPersonId: person.id,
		evalType: 'NCOER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		notes: null,
		archivedAt: null,
		...overrides
	};
}

function evaluation(overrides: Partial<Evaluation>): Evaluation {
	return {
		id: 'eval-1',
		ratingSchemeId: 'scheme-1',
		ratedPersonId: person.id,
		evalType: 'NCOER',
		reportType: 'AN',
		ratingPeriodStart: '2025-12-01',
		ratingPeriodEnd: '2026-11-30',
		workflowStatus: 'drafting',
		notes: null,
		signedChain: null,
		...overrides
	};
}

function load(ratingSchemes: RatingScheme[], evaluations: Evaluation[], names = new Map<string, string>()) {
	return loadPersonnelActiveEvaluation({
		ratingScheme: { listPersonReadiness: async () => ({ ratingSchemes, evaluations }) },
		asOf: '2026-10-06',
		loadAuthorizedPerson: async () => person,
		findPersonNames: async () => names
	});
}

describe('loadPersonnelActiveEvaluation', () => {
	it('reads the open Evaluation with its scheme’s evaluator names, thru-date timing and phase', async () => {
		const result = await load(
			[
				scheme({
					raterPersonId: 'alvarez',
					seniorRaterPersonId: 'whitaker',
					reviewerName: 'MAJ Chen (external)',
					intermediateRaterPersonId: 'hidden'
				})
			],
			[evaluation({ id: 'done', workflowStatus: 'completed', ratingPeriodEnd: '2027-01-01' }), evaluation({})],
			new Map([
				['alvarez', 'SSG Alvarez'],
				['whitaker', 'SFC Whitaker']
			])
		);

		expect(result).toEqual({
			evaluationId: 'eval-1',
			evalType: 'NCOER',
			reportType: 'AN',
			reportTypeLabel: 'Annual',
			periodStart: '2025-12-01',
			periodEnd: '2026-11-30',
			daysUntilThru: 55,
			dueStatus: 'due-60',
			workflowStatus: 'drafting',
			phase: { step: 1, label: 'Drafting' },
			rater: 'SSG Alvarez',
			seniorRater: 'SFC Whitaker',
			intermediateRater: 'Unknown',
			reviewer: 'MAJ Chen (external)'
		});
	});

	it('keeps an open Evaluation on the card after its scheme is archived', async () => {
		const result = await load([scheme({ archivedAt: '2026-05-01T00:00:00Z' })], [evaluation({ id: 'still-open' })]);

		expect(result?.evaluationId).toBe('still-open');
	});

	it('skips a not-tracked Evaluation on an archived scheme', async () => {
		const result = await load(
			[scheme({ archivedAt: '2026-05-01T00:00:00Z' })],
			[evaluation({ id: 'off-the-scheme', workflowStatus: null })]
		);

		expect(result).toBeNull();
	});

	it('resolves to null when every Evaluation is completed', async () => {
		expect(await load([scheme()], [evaluation({ workflowStatus: 'completed' })])).toBeNull();
	});
});

describe('evaluationPhase', () => {
	it('groups the fourteen workflow statuses into five phases and keeps the real label', () => {
		const statuses: Array<WorkflowStatus | null> = [
			null,
			'drafting',
			'command-review',
			'with-rater',
			'rater-signed',
			'with-intermediate-rater',
			'ir-signed',
			'with-senior-rater',
			'sr-signed',
			'with-reviewer',
			'reviewer-signed',
			'with-rated-soldier',
			'sm-signed',
			'submitted-to-hrc',
			'completed'
		];

		expect(statuses.map((status) => evaluationPhase(status))).toEqual([
			{ step: 0, label: 'Not tracked' },
			{ step: 1, label: 'Drafting' },
			{ step: 1, label: 'Command Review' },
			{ step: 2, label: 'With Rater' },
			{ step: 2, label: 'Rater Signed' },
			{ step: 3, label: 'With Intermediate Rater' },
			{ step: 3, label: 'IR Signed' },
			{ step: 3, label: 'With Senior Rater' },
			{ step: 3, label: 'SR Signed' },
			{ step: 4, label: 'With Reviewer' },
			{ step: 4, label: 'Reviewer Signed' },
			{ step: 4, label: 'With Rated Soldier' },
			{ step: 4, label: 'SM Signed' },
			{ step: 5, label: 'Submitted to HRC' },
			{ step: 5, label: 'Completed' }
		]);
	});
});
