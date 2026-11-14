import { describe, expect, it } from 'vitest';
import { line, linePersonnel } from './ratingSchemeLineTestData';
import { createChainSearch } from './ratingSchemeSearch';

describe('createChainSearch', () => {
	const lines = [
		line('a', { ratedPersonId: 'watanabe' }),
		line('b', {
			ratedPersonId: 'park',
			raterPersonId: null,
			raterName: 'Maj. Outside',
			seniorRaterPersonId: 'reyes',
			reviewerPersonId: 'alvarez'
		})
	];
	const search = (query: string) => lines.filter(createChainSearch(query, linePersonnel)).map((entry) => entry.id);

	it('keeps everything for an empty query', () => {
		expect(search('  ')).toEqual(['a', 'b']);
	});

	it('finds a line by its Rated Soldier', () => {
		expect(search('watanabe')).toEqual(['a']);
	});

	it('finds a line by any evaluator in its chain, in unit or external', () => {
		expect(search('cpt reyes')).toEqual(['b']);
		expect(search('outside')).toEqual(['b']);
		expect(search('Alvarez, Marisol')).toEqual(['a', 'b']);
	});

	it('finds nothing for a name nobody in the chain has', () => {
		expect(search('zzz')).toEqual([]);
	});
});
