import { describe, expect, it } from 'vitest';
import { impliedIds, toggleSelection, treeShape, type TreeSelectOption } from './treeSelectRows';

const options: TreeSelectOption[] = [
	{ id: 'p1', label: '1st Platoon', depth: 0 },
	{ id: 'p1-s1', label: '1st Squad', depth: 1 },
	{ id: 'p1-s1-a', label: 'Alpha Team', depth: 2 },
	{ id: 'p1-s2', label: '2nd Squad', depth: 1 },
	{ id: 'p2', label: '2nd Platoon', depth: 0 },
	{ id: 'p2-s1', label: '1st Squad', depth: 1 }
];
const shape = treeShape(options);
const toggle = (value: string[], id: string) => toggleSelection(options, shape, value, id);

describe('toggleSelection', () => {
	it('keeps only the platoon when a squad is chosen and then its platoon', () => {
		const squad = toggle([], 'p1-s1');
		expect(squad).toEqual(['p1-s1']);
		expect(toggle(squad, 'p1')).toEqual(['p1']);
	});

	it('restores nothing implicit when the platoon is unchosen', () => {
		expect(toggle(['p1'], 'p1')).toEqual([]);
	});

	it('ignores a node already covered by a chosen ancestor', () => {
		expect(toggle(['p1', 'p2-s1'], 'p1-s1-a')).toEqual(['p1', 'p2-s1']);
	});

	it('lists choices in tree order and keeps ids the tree does not know', () => {
		expect(toggle(['gone', 'p2-s1'], 'p1-s2')).toEqual(['p1-s2', 'p2-s1', 'gone']);
	});
});

describe('impliedIds', () => {
	it('names every node under a chosen node and not the chosen nodes', () => {
		expect([...impliedIds(shape, ['p1', 'p2-s1'])]).toEqual(['p1-s1', 'p1-s1-a', 'p1-s2']);
	});
});
