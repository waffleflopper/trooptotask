import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { SavedRatingSchemeEntry } from '../contracts';
import type { WorkflowStatus } from '../rating-scheme.types';
import { evaluationPhase } from '../utils/evaluationPhase';
import { loadPersonnelActiveEvaluation } from './personnelActiveEvaluation.server';

const person = { id: 'okafor' } as Personnel;

function entry(overrides: Partial<SavedRatingSchemeEntry>): SavedRatingSchemeEntry {
	return {
		id: 'eval-1',
		organization_id: 'org-1',
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
		ratingPeriodStart: '2025-12-01',
		ratingPeriodEnd: '2026-11-30',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'drafting',
		created_at: '2025-12-01T00:00:00Z',
		updated_at: '2025-12-01T00:00:00Z',
		...overrides
	};
}

describe('loadPersonnelActiveEvaluation', () => {
	it('reads the newest noncompleted entry with evaluator names, thru-date timing and phase', async () => {
		const evaluation = await loadPersonnelActiveEvaluation({
			ratingScheme: {
				listPersonReadiness: async () => [
					entry({ id: 'done', status: 'completed', ratingPeriodEnd: '2027-01-01' }),
					entry({
						raterPersonId: 'alvarez',
						seniorRaterPersonId: 'whitaker',
						reviewerName: 'MAJ Chen (external)',
						intermediateRaterPersonId: 'hidden'
					}),
					entry({ id: 'older', ratingPeriodEnd: '2025-11-30' })
				]
			},
			asOf: '2026-10-06',
			loadAuthorizedPerson: async () => person,
			findPersonNames: async () =>
				new Map([
					['alvarez', 'SSG Alvarez'],
					['whitaker', 'SFC Whitaker']
				])
		});

		expect(evaluation).toEqual({
			entryId: 'eval-1',
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

	it('resolves to null when every entry is completed', async () => {
		const evaluation = await loadPersonnelActiveEvaluation({
			ratingScheme: { listPersonReadiness: async () => [entry({ status: 'completed' })] },
			asOf: '2026-10-06',
			loadAuthorizedPerson: async () => person,
			findPersonNames: async () => new Map()
		});

		expect(evaluation).toBeNull();
	});
});

describe('evaluationPhase', () => {
	it('groups the thirteen workflow statuses into five phases and keeps the real label', () => {
		const statuses: Array<WorkflowStatus | null> = [
			null,
			'drafting',
			'with-rater',
			'rater-signed',
			'with-senior-rater',
			'sr-signed',
			'with-intermediate-rater',
			'ir-signed',
			'with-reviewer',
			'reviewer-signed',
			'with-rated-soldier',
			'sm-signed',
			'submitted-to-s1',
			'completed'
		];

		expect(statuses.map((status) => evaluationPhase(status))).toEqual([
			{ step: 0, label: 'Not started' },
			{ step: 1, label: 'Drafting' },
			{ step: 2, label: 'With Rater' },
			{ step: 2, label: 'Rater Signed' },
			{ step: 3, label: 'With Senior Rater' },
			{ step: 3, label: 'SR Signed' },
			{ step: 3, label: 'With Intermediate Rater' },
			{ step: 3, label: 'IR Signed' },
			{ step: 4, label: 'With Reviewer' },
			{ step: 4, label: 'Reviewer Signed' },
			{ step: 4, label: 'With Rated Soldier' },
			{ step: 4, label: 'SM Signed' },
			{ step: 5, label: 'Submitted to S1' },
			{ step: 5, label: 'Completed' }
		]);
	});
});
