import type { PersonnelLookup } from '$features/personnel/contracts';
import type { Evaluation, RatingScheme } from '../rating-scheme.types';
import type { RatingSchemeLine } from './ratingSchemeLines';

export const linePersonnel: PersonnelLookup[] = [
	{ id: 'chen', rank: '1LT', firstName: 'Wei', lastName: 'Chen' },
	{ id: 'alvarez', rank: 'SSG', firstName: 'Marisol', lastName: 'Alvarez' },
	{ id: 'reyes', rank: 'CPT', firstName: 'Ana', lastName: 'Reyes' },
	{ id: 'watanabe', rank: 'SGT', firstName: 'Kenji', lastName: 'Watanabe' },
	{ id: 'park', rank: 'SGT', firstName: 'Lena', lastName: 'Park' }
];

export function scheme(id: string, overrides: Partial<RatingScheme> = {}): RatingScheme {
	return {
		id,
		ratedPersonId: 'watanabe',
		evalType: 'NCOER',
		raterPersonId: 'alvarez',
		raterName: null,
		seniorRaterPersonId: 'chen',
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

export function evaluation(id: string, ratingSchemeId: string, overrides: Partial<Evaluation> = {}): Evaluation {
	return {
		id,
		ratingSchemeId,
		ratedPersonId: 'watanabe',
		evalType: 'NCOER',
		reportType: 'AN',
		ratingPeriodStart: '2026-01-01',
		ratingPeriodEnd: '2026-12-31',
		workflowStatus: 'drafting',
		notes: null,
		signedChain: null,
		...overrides
	};
}

export function line(id: string, overrides: Partial<RatingSchemeLine> = {}): RatingSchemeLine {
	return { ...scheme(id), open: null, ...overrides };
}
