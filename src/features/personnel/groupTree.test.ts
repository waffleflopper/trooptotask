import { describe, expect, it } from 'vitest';
import type { Group } from './contracts';
import { buildGroupTree, soleLeafGroup, type Band } from './groupTree';

function group(id: string, name: string, sortOrder: number, parentId: string | null, depth: 1 | 2 | 3): Group {
	return { id, name, sortOrder, parentId, depth };
}

const catalog: Group[] = [
	group('plt2', '2nd Platoon', 2, null, 1),
	group('sq2', '2nd Squad', 1, 'plt2', 2),
	group('sq1', '1st Squad', 0, 'plt2', 2),
	group('sq1-bravo', 'Bravo Team', 1, 'sq1', 3),
	group('sq1-alpha', 'Alpha Team', 0, 'sq1', 3),
	group('sq2-alpha', 'Alpha Team', 0, 'sq2', 3),
	group('hq', 'HQ Section', 0, null, 1),
	group('plt1', '1st Platoon', 1, null, 1)
];

interface Person {
	id: string;
	groupId: string | null;
}

const people: Person[] = [
	{ id: 'psg', groupId: 'plt2' },
	{ id: 'plt-ldr', groupId: 'plt2' },
	{ id: 'sl1', groupId: 'sq1' },
	{ id: 'a1', groupId: 'sq1-alpha' },
	{ id: 'a2', groupId: 'sq1-alpha' },
	{ id: 'b1', groupId: 'sq1-bravo' },
	{ id: 'c1', groupId: 'sq2-alpha' },
	{ id: 'h1', groupId: 'hq' },
	{ id: 'u1', groupId: null }
];
const groupOf = (person: Person) => person.groupId;
const ids = (items: readonly Person[]) => items.map((person) => person.id);

interface BandShape {
	id: string;
	hq: string[];
	count: number;
	children: BandShape[];
}
const shape = (band: Band<Person>): BandShape => ({
	id: band.node.id,
	hq: ids(band.hq),
	count: band.count,
	children: band.children.map(shape)
});

describe('buildGroupTree', () => {
	const tree = buildGroupTree(catalog);

	it('orders Groups depth first with siblings in Organization order', () => {
		expect(tree.ordered.map((node) => [node.id, node.level, node.hasChildren])).toEqual([
			['hq', 0, false],
			['plt1', 0, false],
			['plt2', 0, true],
			['sq1', 1, true],
			['sq1-alpha', 2, false],
			['sq1-bravo', 2, false],
			['sq2', 1, true],
			['sq2-alpha', 2, false]
		]);
		expect(tree.roots.map((node) => node.id)).toEqual(['hq', 'plt1', 'plt2']);
	});

	it('labels a Group by its path so cousins with the same name stay distinct', () => {
		expect(tree.label('sq1-alpha')).toBe('2nd Platoon › 1st Squad › Alpha Team');
		expect(tree.label('sq2-alpha')).toBe('2nd Platoon › 2nd Squad › Alpha Team');
		expect(tree.label('plt2')).toBe('2nd Platoon');
	});

	it('answers whether a Group sits inside another', () => {
		expect(tree.contains('plt2', 'sq1-bravo')).toBe(true);
		expect(tree.contains('sq1', 'sq1')).toBe(true);
		expect(tree.contains('sq1', 'sq2-alpha')).toBe(false);
		expect(tree.contains('plt2', null)).toBe(false);
	});

	it('bands HQ people under their Group before its sub-groups, counts the subtree, and drops empty Groups', () => {
		expect(tree.bands(people, groupOf).map(shape)).toEqual([
			{ id: 'hq', hq: ['h1'], count: 1, children: [] },
			{
				id: 'plt2',
				hq: ['psg', 'plt-ldr'],
				count: 7,
				children: [
					{
						id: 'sq1',
						hq: ['sl1'],
						count: 4,
						children: [
							{ id: 'sq1-alpha', hq: ['a1', 'a2'], count: 2, children: [] },
							{ id: 'sq1-bravo', hq: ['b1'], count: 1, children: [] }
						]
					},
					{ id: 'sq2', hq: [], count: 1, children: [{ id: 'sq2-alpha', hq: ['c1'], count: 1, children: [] }] }
				]
			}
		]);
	});

	it('leads with pinned top-level Groups and ignores pins below the top', () => {
		const pinned = buildGroupTree(catalog, { pinnedIds: ['sq1-bravo', 'plt2'] });

		expect(pinned.ordered.map((node) => node.id)).toEqual([
			'plt2',
			'sq1',
			'sq1-alpha',
			'sq1-bravo',
			'sq2',
			'sq2-alpha',
			'hq',
			'plt1'
		]);
	});
});

describe('buildGroupTree for a Group-scoped reader', () => {
	it('makes a team leader’s one Group, whose parent is hidden, the only root', () => {
		const tree = buildGroupTree([group('sq1-alpha', 'Alpha Team', 0, 'sq1', 3)]);

		expect(tree.roots.map((node) => [node.id, node.level])).toEqual([['sq1-alpha', 0]]);
		expect(tree.label('sq1-alpha')).toBe('Alpha Team');
		expect(tree.bands(people, groupOf).map(shape)).toEqual([
			{ id: 'sq1-alpha', hq: ['a1', 'a2'], count: 2, children: [] }
		]);
	});

	it('labels below a single root without repeating the root', () => {
		const tree = buildGroupTree(catalog.filter((entry) => entry.id !== 'hq' && entry.id !== 'plt1'));

		expect(tree.label('sq2-alpha')).toBe('2nd Squad › Alpha Team');
		expect(tree.label('plt2')).toBe('2nd Platoon');
	});

	it('tells apart two visible roots that share a name', () => {
		const tree = buildGroupTree([
			group('sq1-alpha', 'Alpha Team', 0, 'sq1', 3),
			group('sq2-alpha', 'Alpha Team', 0, 'sq2', 3)
		]);

		expect([tree.label('sq1-alpha'), tree.label('sq2-alpha')]).toEqual(['Alpha Team', 'Alpha Team (2)']);
	});
});

describe('soleLeafGroup', () => {
	it('names the one Group a scoped reader sees only when nothing sits under it', () => {
		const team = buildGroupTree([group('sq1-alpha', 'Alpha Team', 0, 'sq1', 3)]);
		const squad = buildGroupTree(catalog.filter((entry) => ['sq1', 'sq1-alpha'].includes(entry.id)));

		expect(soleLeafGroup(team, false)?.id).toBe('sq1-alpha');
		expect(soleLeafGroup(team, true)).toBeNull();
		expect(soleLeafGroup(squad, false)).toBeNull();
		expect(soleLeafGroup(buildGroupTree(catalog), false)).toBeNull();
	});
});
