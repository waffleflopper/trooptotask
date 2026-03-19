import { describe, it, expect } from 'vitest';
import { scopePersonnel, scopePersonnelByGroup } from './scopePersonnel';
import type { Personnel } from '$lib/types';

function makePerson(overrides: Partial<Personnel>): Personnel {
	return {
		id: crypto.randomUUID(),
		rank: 'SGT',
		lastName: 'Person',
		firstName: 'Test',
		mos: '11B',
		clinicRole: '',
		groupId: null,
		groupName: '',
		...overrides
	} as Personnel;
}

describe('scopePersonnel', () => {
	const groupA = 'group-a';
	const groupB = 'group-b';
	const personnel = [
		makePerson({ firstName: 'Alice', groupId: groupA }),
		makePerson({ firstName: 'Bob', groupId: groupB }),
		makePerson({ firstName: 'Carol', groupId: groupA }),
		makePerson({ firstName: 'Dave', groupId: null })
	];

	it('returns full list when scopedGroupId is null', () => {
		const result = scopePersonnel(personnel, null);
		expect(result).toHaveLength(4);
	});

	it('filters to only matching group when scopedGroupId is set', () => {
		const result = scopePersonnel(personnel, groupA);
		expect(result).toHaveLength(2);
		expect(result.every((p) => p.groupId === groupA)).toBe(true);
	});

	it('returns empty array when no personnel match the group', () => {
		const result = scopePersonnel(personnel, 'nonexistent-group');
		expect(result).toEqual([]);
	});

	it('does not mutate the original array', () => {
		const original = [...personnel];
		scopePersonnel(personnel, groupA);
		expect(personnel).toHaveLength(original.length);
	});
});

describe('scopePersonnelByGroup', () => {
	const groupA = 'group-a';
	const groupB = 'group-b';

	const personnelByGroup = [
		{
			group: 'Alpha',
			personnel: [
				makePerson({ firstName: 'Alice', groupId: groupA }),
				makePerson({ firstName: 'Carol', groupId: groupA })
			]
		},
		{
			group: 'Bravo',
			personnel: [makePerson({ firstName: 'Bob', groupId: groupB })]
		}
	];

	it('returns all groups when scopedGroupId is null', () => {
		const result = scopePersonnelByGroup(personnelByGroup, null);
		expect(result).toHaveLength(2);
	});

	it('filters to only the matching group when scopedGroupId is set', () => {
		const result = scopePersonnelByGroup(personnelByGroup, groupA);
		expect(result).toHaveLength(1);
		expect(result[0].group).toBe('Alpha');
		expect(result[0].personnel).toHaveLength(2);
	});

	it('returns empty array when no group matches', () => {
		const result = scopePersonnelByGroup(personnelByGroup, 'nonexistent');
		expect(result).toEqual([]);
	});
});
