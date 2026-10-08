import { describe, expect, it } from 'vitest';
import { getEvalTypeForRank } from './ratingScheme';

describe('getEvalTypeForRank', () => {
	it.each([
		['2LT', 'OER'],
		['CPT', 'OER'],
		['GEN', 'OER'],
		['WO1', 'WOER'],
		['CW5', 'WOER'],
		['SGT', 'NCOER'],
		['CSM', 'NCOER'],
		['PV1', 'NCOER'],
		['SP4', 'NCOER'],
		['CIV', 'NCOER'],
		['ADM', 'NCOER'],
		['CWO3', 'NCOER'],
		['cpt', 'NCOER'],
		[' CPT', 'NCOER'],
		['', 'NCOER']
	])('maps %j to %s', (rank, evalType) => {
		expect(getEvalTypeForRank(rank)).toBe(evalType);
	});
});
