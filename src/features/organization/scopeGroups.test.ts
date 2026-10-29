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
