import { describe, expect, it } from 'vitest';
import type { ScopeGroup } from './memberSettingsTypes';
import { scopeTree } from './scopeGroups';

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
		{ ids: ['sq1'], named: ['1st Squad'], people: 12 },
		{ ids: ['alpha'], named: ['Alpha Team'], people: 6 },
		{ ids: ['alpha', 'sq1', 'hq'], named: ['1st Squad', 'HQ'], people: 16 },
		{ ids: ['plt2'], named: ['2nd Platoon'], people: 17 }
	])('summarizes $ids by their top Groups and subtree headcount', ({ ids, named, people }) => {
		const summary = tree.summary(ids);

		for (const name of named) expect(summary).toContain(name);
		expect(summary).toMatch(new RegExp(`\\b${people} people\\b`));
	});

	describe('when two Groups share a name', () => {
		const twins: ScopeGroup[] = [
			{ id: 'plt1', name: '1st Platoon', parentId: null, memberCount: 0 },
			{ id: 'sq1', name: '1st Squad', parentId: 'plt1', memberCount: 0 },
			{ id: 'alpha1', name: 'Alpha Team', parentId: 'sq1', memberCount: 2 },
			{ id: 'plt2', name: '2nd Platoon', parentId: null, memberCount: 0 },
			{ id: 'sq2', name: '2nd Squad', parentId: 'plt2', memberCount: 0 },
			{ id: 'alpha2', name: '  alpha team ', parentId: 'sq2', memberCount: 3 },
			{ id: 'hq', name: 'HQ', parentId: null, memberCount: 4 }
		];
		const duplicated = scopeTree(twins);

		it('names each by its path, ignoring case and surrounding spaces, and leaves unique names bare', () => {
			expect(duplicated.summary(['alpha1', 'hq'])).toBe(
				'Sees 1st Platoon › 1st Squad › Alpha Team plus HQ: 6 people. Not Unassigned.'
			);
			expect(duplicated.summary(['alpha2'])).toMatch(/^Sees 2nd Platoon › 2nd Squad ›\s+alpha team\s*: 3 people/);
		});

		it('names a Group that has sub-groups by its path too', () => {
			const nested = scopeTree([
				{ id: 'a', name: 'Alpha', parentId: null, memberCount: 1 },
				{ id: 'a-sq', name: 'Squad', parentId: 'a', memberCount: 1 },
				{ id: 'b', name: 'Bravo', parentId: null, memberCount: 1 },
				{ id: 'b-alpha', name: 'ALPHA', parentId: 'b', memberCount: 1 },
				{ id: 'b-alpha-t', name: 'Team', parentId: 'b-alpha', memberCount: 1 }
			]);

			expect(nested.summary(['b-alpha'])).toBe('Sees Bravo › ALPHA and its 1 sub-group: 2 people. Not Unassigned.');
		});
	});

	it('leaves a covered team out of the summary', () => {
		expect(tree.summary(['alpha', 'sq1'])).not.toContain('Alpha Team');
	});

	it('treats a Group whose parent it cannot see as a root', () => {
		const visible = scopeTree(groups.filter((group) => group.id === 'alpha' || group.id === 'bravo'));

		expect(visible.options.map((option) => [option.id, option.depth])).toEqual([
			['alpha', 0],
			['bravo', 0]
		]);
	});
});
