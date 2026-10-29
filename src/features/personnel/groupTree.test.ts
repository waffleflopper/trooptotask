import { describe, expect, it } from 'vitest';
import type { Group } from './contracts';
import { buildGroupTree, type Band } from './groupTree';

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

	it('keeps the people inside a focus, Unassigned included only when focused', () => {
		expect(ids(tree.within({ kind: 'group', id: 'sq1' }, people, groupOf))).toEqual(['sl1', 'a1', 'a2', 'b1']);
		expect(ids(tree.within({ kind: 'unassigned' }, people, groupOf))).toEqual(['u1']);
		expect(tree.within({ kind: 'all' }, people, groupOf)).toHaveLength(9);
		expect(tree.within({ kind: 'group', id: 'gone' }, people, groupOf)).toEqual([]);
	});

	it('bands HQ people under their Group before its sub-groups, counts the subtree, and drops empty Groups', () => {
		expect(tree.bands({ kind: 'all' }, people, groupOf).map(shape)).toEqual([
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
		expect(tree.bands({ kind: 'group', id: 'sq2' }, people, groupOf).map(shape)).toEqual([
			{ id: 'sq2', hq: [], count: 1, children: [{ id: 'sq2-alpha', hq: ['c1'], count: 1, children: [] }] }
		]);
		expect(tree.bands({ kind: 'unassigned' }, people, groupOf)).toEqual([]);
	});

	it('breaks the whole unit into top-level Groups and Unassigned, each person in one row', () => {
		const breakdown = tree.breakdown({ kind: 'all' }, people, groupOf);

		expect(breakdown.rows.map((row) => [row.kind, row.label, ids(row.items)])).toEqual([
			['group', 'HQ Section', ['h1']],
			['group', '2nd Platoon', ['psg', 'plt-ldr', 'sl1', 'a1', 'a2', 'b1', 'c1']],
			['unassigned', 'Unassigned', ['u1']]
		]);
		expect(breakdown.total).toHaveLength(9);
	});

	it('breaks a Group into its HQ and its sub-groups, each drilling into that sub-group', () => {
		const breakdown = tree.breakdown({ kind: 'group', id: 'plt2' }, people, groupOf);

		expect(breakdown.rows.map((row) => [row.kind, row.label, ids(row.items)])).toEqual([
			['hq', '2nd Platoon HQ', ['psg', 'plt-ldr']],
			['group', '1st Squad', ['sl1', 'a1', 'a2', 'b1']],
			['group', '2nd Squad', ['c1']]
		]);
		expect(breakdown.rows.flatMap((row) => (row.kind === 'group' ? [row.drill] : []))).toEqual([
			{ kind: 'group', id: 'sq1' },
			{ kind: 'group', id: 'sq2' }
		]);
		expect(ids(breakdown.total)).toEqual(['psg', 'plt-ldr', 'sl1', 'a1', 'a2', 'b1', 'c1']);
	});

	it('drops an empty HQ row and gives a Group without sub-groups no rows', () => {
		expect(tree.breakdown({ kind: 'group', id: 'sq2' }, people, groupOf).rows.map((row) => row.label)).toEqual([
			'Alpha Team'
		]);
		expect(tree.breakdown({ kind: 'group', id: 'sq1-bravo' }, people, groupOf)).toEqual({
			total: [{ id: 'b1', groupId: 'sq1-bravo' }],
			rows: []
		});
	});

	it('counts every Group subtree, including empty ones', () => {
		expect(Object.fromEntries(tree.subtreeCounts(people, groupOf))).toEqual({
			hq: 1,
			plt1: 0,
			plt2: 7,
			sq1: 4,
			'sq1-alpha': 2,
			'sq1-bravo': 1,
			sq2: 1,
			'sq2-alpha': 1
		});
	});

	it('keeps only the outermost of the listed Groups', () => {
		expect(tree.canonicalRoots(['sq1-alpha', 'plt2', 'hq', 'sq1', 'hq'])).toEqual(['plt2', 'hq']);
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
		expect(tree.bands({ kind: 'all' }, people, groupOf).map(shape)).toEqual([
			{ id: 'sq1-alpha', hq: ['a1', 'a2'], count: 2, children: [] }
		]);
	});

	it('labels below a single root without repeating the root', () => {
		const tree = buildGroupTree(catalog.filter((entry) => entry.id !== 'hq' && entry.id !== 'plt1'));
		const visible = people.filter((person) => tree.contains('plt2', person.groupId));

		expect(tree.label('sq2-alpha')).toBe('2nd Squad › Alpha Team');
		expect(tree.label('plt2')).toBe('2nd Platoon');
		expect(tree.breakdown({ kind: 'all' }, visible, groupOf).rows.map((row) => row.label)).toEqual([
			'2nd Platoon HQ',
			'1st Squad',
			'2nd Squad'
		]);
	});

	it('tells apart two visible roots that share a name', () => {
		const tree = buildGroupTree([
			group('sq1-alpha', 'Alpha Team', 0, 'sq1', 3),
			group('sq2-alpha', 'Alpha Team', 0, 'sq2', 3)
		]);

		expect([tree.label('sq1-alpha'), tree.label('sq2-alpha')]).toEqual(['Alpha Team', 'Alpha Team (2)']);
	});
});
