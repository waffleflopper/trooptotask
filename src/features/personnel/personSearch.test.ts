import { describe, expect, it } from 'vitest';
import { matchesPersonSearch, matchesSearchTokens, toPersonSearchEntry, type PersonSearchEntry } from './personSearch';

const john: PersonSearchEntry = {
	id: 'p1',
	slug: 'smith-john',
	rank: 'SGT',
	firstName: 'John',
	lastName: 'Smith',
	groupName: '1st Platoon'
};

describe('person search', () => {
	it.each(['SGT Smith', 'Smith John', 'smith, john', 'JOHN  smith', 'sgt', 'smi jo', '1st plat sgt'])(
		'finds John Smith for "%s"',
		(query) => {
			expect(matchesPersonSearch(john, query)).toBe(true);
		}
	);

	it.each(['SSG Smith', 'Smith Jane', 'smith john zed', 'jones'])('does not find John Smith for "%s"', (query) => {
		expect(matchesPersonSearch(john, query)).toBe(false);
	});

	it('matches everyone for a blank or punctuation-only query', () => {
		expect(matchesPersonSearch(john, '')).toBe(true);
		expect(matchesPersonSearch(john, '  , ')).toBe(true);
	});

	it('finds a Person without a Group by name and never matches a Group word', () => {
		const unassigned = { ...john, groupName: null };
		expect(matchesPersonSearch(unassigned, 'sgt smith')).toBe(true);
		expect(matchesPersonSearch(unassigned, 'platoon')).toBe(false);
	});

	it('needs each word in some field, not all words in one field', () => {
		expect(matchesSearchTokens(['68W', 'Medic'], 'medic 68w')).toBe(true);
		expect(matchesSearchTokens(['68W', 'Medic'], 'medic 11b')).toBe(false);
	});

	it('ignores punctuation inside fields', () => {
		expect(matchesSearchTokens(['E-5'], 'e5')).toBe(false);
		expect(matchesSearchTokens(['E-5'], 'e-5')).toBe(true);
		expect(matchesSearchTokens(["O'Brien"], 'obrien')).toBe(false);
		expect(matchesSearchTokens(["O'Brien"], "o'brien")).toBe(true);
	});

	it('keeps only the search fields of a roster Person', () => {
		expect(
			toPersonSearchEntry({
				id: 'p9',
				slug: 'doe-jane',
				rank: 'SPC',
				firstName: 'Jane',
				lastName: 'Doe',
				mos: '68W',
				clinicRole: 'Medic',
				ets: null,
				deros: null,
				groupId: 'g1',
				groupName: 'Alpha',
				archivedAt: null
			})
		).toEqual({ id: 'p9', slug: 'doe-jane', rank: 'SPC', firstName: 'Jane', lastName: 'Doe', groupName: 'Alpha' });
	});
});
