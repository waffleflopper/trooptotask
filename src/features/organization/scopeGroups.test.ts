import { describe, expect, it } from 'vitest';
import { scopeTree, type ScopeGroup } from './scopeGroups';

const groups: ScopeGroup[] = [
	{ id: 'plt2', name: '2nd Platoon', parentId: null, memberCount: 2 },
	{ id: 'hq', name: 'HQ', parentId: null, memberCount: 4 },
	{ id: 'sq1', name: '1st Squad', parentId: 'plt2', memberCount: 1 },
	{ id: 'alpha', name: 'Alpha Team', parentId: 'sq1', memberCount: 6 },
	{ id: 'bravo', name: 'Bravo Team', parentId: 'sq1', memberCount: 5 },
	{ id: 'sq2', name: '2nd Squad', parentId: 'plt2', memberCount: 3 }
];

describe('scopeTree', () => {
	const tree = scopeTree(groups);

	it('orders Groups depth first with counts across each subtree', () => {
		expect(tree.options).toEqual([
			{ id: 'plt2', label: '2nd Platoon', depth: 0, count: 17 },
			{ id: 'sq1', label: '1st Squad', depth: 1, count: 12 },
			{ id: 'alpha', label: 'Alpha Team', depth: 2, count: 6 },
			{ id: 'bravo', label: 'Bravo Team', depth: 2, count: 5 },
			{ id: 'sq2', label: '2nd Squad', depth: 1, count: 3 },
			{ id: 'hq', label: 'HQ', depth: 0, count: 4 }
		]);
	});

	it('keeps only the roots of a selection, in tree order, and drops unknown ids', () => {
		expect(tree.canonical(['alpha', 'hq', 'sq1', 'gone'])).toEqual(['sq1', 'hq']);
		expect(tree.canonical(['bravo', 'alpha'])).toEqual(['alpha', 'bravo']);
		expect(tree.canonical(['plt2', 'bravo', 'sq2'])).toEqual(['plt2']);
	});

	it('names a Group by its path', () => {
		expect(tree.path('bravo')).toBe('2nd Platoon › 1st Squad › Bravo Team');
		expect(tree.path('hq')).toBe('HQ');
		expect(tree.path('gone')).toBe('Unknown group');
	});

	it.each([
		[['sq1'], 'Sees 1st Squad and its 2 sub-groups: 12 people. Not Unassigned.'],
		[['alpha'], 'Sees Alpha Team: 6 people. Not Unassigned.'],
		[['alpha', 'sq1', 'hq'], 'Sees 1st Squad and its 2 sub-groups plus HQ: 16 people. Not Unassigned.'],
		[['plt2'], 'Sees 2nd Platoon and its 4 sub-groups: 17 people. Not Unassigned.']
	])('summarizes %j', (ids, expected) => {
		expect(tree.summary(ids)).toBe(expected);
	});

	it('treats a Group whose parent it cannot see as a root', () => {
		const visible = scopeTree(groups.filter((group) => group.id === 'alpha' || group.id === 'bravo'));

		expect(visible.options.map((option) => [option.id, option.depth])).toEqual([
			['alpha', 0],
			['bravo', 0]
		]);
	});
});
