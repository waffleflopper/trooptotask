import { describe, expect, it } from 'vitest';
import { buildGroupTree, type Group, type Personnel } from './contracts';
import { nestRosterBands } from './rosterBands';

const groups: Group[] = [
	{ id: 'hq', name: 'HQ Section', sortOrder: 0, parentId: null, depth: 1 },
	{ id: 'plt', name: '2nd Platoon', sortOrder: 1, parentId: null, depth: 1 },
	{ id: 'sq1', name: '1st Squad', sortOrder: 0, parentId: 'plt', depth: 2 },
	{ id: 'alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'sq1', depth: 3 },
	{ id: 'bravo', name: 'Bravo Team', sortOrder: 1, parentId: 'sq1', depth: 3 }
];

const person = (id: string, groupId: string | null, rank = 'PVT') =>
	({ id, groupId, rank, lastName: id, firstName: '' }) as Personnel;
const sections = [
	{ groupId: 'hq', group: 'HQ Section', personnel: [person('reyes', 'hq')] },
	{ groupId: 'plt', group: '2nd Platoon', personnel: [person('park', 'plt'), person('diaz', 'plt')] },
	{ groupId: 'sq1', group: '1st Squad', personnel: [person('lee', 'sq1', 'SSG')] },
	{ groupId: 'alpha', group: 'Alpha Team', personnel: [person('moss', 'alpha'), person('ortiz', 'alpha')] },
	{ groupId: 'gone', group: 'Old Section', personnel: [person('vance', 'gone')] },
	{ groupId: null, group: 'Unassigned', personnel: [person('adams', null)] }
];

function shape(tree = buildGroupTree(groups), nested = true) {
	return nestRosterBands(tree, sections, nested).map((band) => [
		band.groupId,
		band.level,
		band.name,
		band.group,
		band.personnel.map((p) => p.id).join(' '),
		band.people.map((p) => p.id).join(' '),
		band.pinnable
	]);
}

describe('nestRosterBands', () => {
	it('puts each Group’s own people before its sub-groups and keeps people outside the tree last', () => {
		expect(shape()).toEqual([
			['hq', 0, 'HQ Section', 'HQ Section', 'reyes', 'reyes', true],
			['plt', 0, '2nd Platoon', '2nd Platoon', 'park diaz', 'park diaz lee moss ortiz', true],
			['sq1', 1, '1st Squad', '2nd Platoon › 1st Squad', 'lee', 'lee moss ortiz', false],
			['alpha', 2, 'Alpha Team', '2nd Platoon › 1st Squad › Alpha Team', 'moss ortiz', 'moss ortiz', false],
			['gone', 0, 'Old Section', 'Old Section', 'vance', 'vance', true],
			[null, 0, 'Unassigned', 'Unassigned', 'adams', 'adams', false]
		]);
	});

	it('rolls each root into one band of its whole subtree, by rank and then name, with sub-groups hidden', () => {
		expect(shape(buildGroupTree(groups), false)).toEqual([
			['hq', 0, 'HQ Section', 'HQ Section', 'reyes', 'reyes', true],
			['plt', 0, '2nd Platoon', '2nd Platoon', 'lee diaz moss ortiz park', 'lee diaz moss ortiz park', true],
			['gone', 0, 'Old Section', 'Old Section', 'vance', 'vance', true],
			[null, 0, 'Unassigned', 'Unassigned', 'adams', 'adams', false]
		]);
	});

	it('draws a flat Organization as one level of top bands in its own order', () => {
		const flat = buildGroupTree(groups.map((group) => ({ ...group, parentId: null, depth: 1 as const })));
		expect(shape(flat).map(([id, level, name]) => [id, level, name])).toEqual([
			['sq1', 0, '1st Squad'],
			['alpha', 0, 'Alpha Team'],
			['hq', 0, 'HQ Section'],
			['plt', 0, '2nd Platoon'],
			['gone', 0, 'Old Section'],
			[null, 0, 'Unassigned']
		]);
	});
});
