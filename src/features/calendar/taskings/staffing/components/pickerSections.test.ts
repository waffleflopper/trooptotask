import { describe, expect, it } from 'vitest';
import { buildGroupTree, type Group } from '$features/personnel/contracts';
import { pickerSections } from './pickerSections';

const group = (id: string, name: string, parentId: string | null, sortOrder = 0): Group => ({
	id,
	name,
	sortOrder,
	parentId,
	depth: 1
});
const tree = buildGroupTree([
	group('co', 'HHC', null, 0),
	group('p2', '2nd Platoon', null, 1),
	group('s1', '1st Squad', 'p2', 0),
	group('t1', 'Alpha Team', 's1', 0),
	group('s2', '2nd Squad', 'p2', 1)
]);
const labels = { co: 'HHC', p2: '2nd Platoon', s1: '2nd Platoon › 1st Squad', s2: '2nd Platoon › 2nd Squad' };
const person = (id: string, groupId: string | null) => ({ id, groupId });

describe('pickerSections', () => {
	it('lists the responsible Group’s own people first, then each sub-group by path, keeping row order', () => {
		const rows = [person('a', 's2'), person('b', 't1'), person('c', 'p2'), person('d', 's1'), person('e', 'p2')];

		expect(
			pickerSections(tree, 'p2', rows, labels).map((section) => [section.label, section.rows.map((row) => row.id)])
		).toEqual([
			['2nd Platoon HQ', ['c', 'e']],
			['2nd Platoon › 1st Squad HQ', ['d']],
			['2nd Platoon › 1st Squad › Alpha Team', ['b']],
			['2nd Platoon › 2nd Squad', ['a']]
		]);
	});

	it('names a Group with no sub-groups once and closes with picks outside the subtree under their own Group', () => {
		const rows = [person('a', 's2'), person('moved', 'co'), person('gone', null), person('b', 's2')];

		expect(
			pickerSections(tree, 's2', rows, labels).map((section) => [section.label, section.rows.map((row) => row.id)])
		).toEqual([
			['2nd Platoon › 2nd Squad', ['a', 'b']],
			['HHC', ['moved']],
			['Unassigned', ['gone']]
		]);
	});
});
