import { describe, it, expect } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { filterPersonnel } from './reportCalculations';

function makePerson(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'p-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'John',
		mos: '11B',
		clinicRole: 'NCO',
		groupId: 'g-1',
		groupName: 'Alpha',
		...overrides
	};
}

describe('filterPersonnel', () => {
	const people = [
		makePerson({ id: 'p-1', groupId: 'g-1', mos: '11B', clinicRole: 'NCO', rank: 'SGT' }),
		makePerson({ id: 'p-2', groupId: 'g-2', mos: '68W', clinicRole: 'Medic', rank: 'SPC' }),
		makePerson({ id: 'p-3', groupId: 'g-1', mos: '11B', clinicRole: 'Officer', rank: 'CPT' })
	];

	it('returns all personnel when no filters set', () => {
		const result = filterPersonnel(people, {});
		expect(result).toHaveLength(3);
	});

	it('filters by groupId', () => {
		const result = filterPersonnel(people, { groupId: 'g-1' });
		expect(result).toHaveLength(2);
		expect(result.every((p) => p.groupId === 'g-1')).toBe(true);
	});

	it('filters by MOS', () => {
		const result = filterPersonnel(people, { mos: '68W' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p-2');
	});

	it('filters by role', () => {
		const result = filterPersonnel(people, { role: 'Officer' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p-3');
	});

	it('filters by rank', () => {
		const result = filterPersonnel(people, { rank: 'SPC' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p-2');
	});

	it('matches rank filters against trimmed Personnel rank values', () => {
		const paddedRankPeople = [makePerson({ id: 'p-sfc', rank: ' SFC ' }), makePerson({ id: 'p-sgt', rank: 'SGT' })];

		const result = filterPersonnel(paddedRankPeople, { rank: 'SFC' });

		expect(result.map((person) => person.id)).toEqual(['p-sfc']);
	});

	it('matches any selected MOS or duty role and treats an empty selection as everyone', () => {
		const mixed = [...people, makePerson({ id: 'p-4', mos: '', clinicRole: 'NCO' })];

		expect(filterPersonnel(mixed, { mos: ['11B', ''] }).map((p) => p.id)).toEqual(['p-1', 'p-3', 'p-4']);
		expect(filterPersonnel(mixed, { role: ['Medic', 'Officer'] }).map((p) => p.id)).toEqual(['p-2', 'p-3']);
		expect(filterPersonnel(mixed, { mos: [], role: [] })).toHaveLength(4);
		expect(filterPersonnel(mixed, { groupId: 'g-1', mos: ['11B'], role: ['NCO'] }).map((p) => p.id)).toEqual(['p-1']);
	});

	it('combines multiple filters with AND logic', () => {
		const result = filterPersonnel(people, { groupId: 'g-1', role: 'NCO' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p-1');
	});
});
