import { describe, expect, it } from 'vitest';
import { matchesPersonnelSearch } from './personnelSearch';
import type { Personnel } from '$features/personnel/contracts';

const okafor: Personnel = {
	id: 'p-1',
	rank: 'SGT',
	lastName: 'Okafor',
	firstName: 'Daniel',
	mos: '68W',
	clinicRole: '',
	groupId: null,
	groupName: 'Alpha'
};

describe('matchesPersonnelSearch', () => {
	it('matches name, rank and MOS in any case', () => {
		expect(matchesPersonnelSearch(okafor, 'okaf')).toBe(true);
		expect(matchesPersonnelSearch(okafor, 'sgt')).toBe(true);
		expect(matchesPersonnelSearch(okafor, '68w')).toBe(true);
	});

	it('requires every word, in any order, and tolerates the roster comma', () => {
		expect(matchesPersonnelSearch(okafor, 'Okafor, Daniel')).toBe(true);
		expect(matchesPersonnelSearch(okafor, 'daniel sgt')).toBe(true);
		expect(matchesPersonnelSearch(okafor, 'okafor 91b')).toBe(false);
	});

	it('matches everyone for a blank query', () => {
		expect(matchesPersonnelSearch(okafor, '  ')).toBe(true);
	});

	it('does not match the group name', () => {
		expect(matchesPersonnelSearch(okafor, 'alpha')).toBe(false);
	});
});
