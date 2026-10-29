import { describe, expect, it } from 'vitest';
import type { Group } from './group.types';
import { buildGroupTree } from './groupTree';
import { addStandardSquads, canMoveUnder, groupDeletion, ordinal } from './groupStructure';

const catalog: Group[] = [
	{ id: 'plt1', name: '1st Platoon', sortOrder: 0, parentId: null, depth: 1 },
	{ id: 'sq1', name: '1st Squad', sortOrder: 0, parentId: 'plt1', depth: 2 },
	{ id: 'sq1-alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'sq1', depth: 3 },
	{ id: 'sq1-bravo', name: 'Bravo Team', sortOrder: 1, parentId: 'sq1', depth: 3 },
	{ id: 'sq2', name: '2nd Squad', sortOrder: 1, parentId: 'plt1', depth: 2 },
	{ id: 'plt2', name: '2nd Platoon', sortOrder: 1, parentId: null, depth: 1 },
	{ id: 'hq', name: 'HQ Section', sortOrder: 2, parentId: null, depth: 1 }
];
const tree = buildGroupTree(catalog);
const people = [
	{ id: 'psg', groupId: 'plt1' },
	{ id: 'sl', groupId: 'sq1' },
	{ id: 'a1', groupId: 'sq1-alpha' },
	{ id: 'a2', groupId: 'sq1-alpha' },
	{ id: 'b1', groupId: 'sq1-bravo' },
	{ id: 'c1', groupId: 'sq2' },
	{ id: 'u1', groupId: null }
];

describe('groupDeletion', () => {
	const of = (id: string) => {
		const deletion = groupDeletion(tree, id, people, (person) => person.groupId);
		return (
			deletion && {
				descendants: deletion.descendants.map((node) => node.name),
				ids: [...deletion.ids],
				memberCount: deletion.memberCount
			}
		);
	};

	it('names every Group under it and counts everyone in the subtree', () => {
		expect(of('plt1')).toEqual({
			descendants: ['1st Squad', 'Alpha Team', 'Bravo Team', '2nd Squad'],
			ids: ['plt1', 'sq1', 'sq1-alpha', 'sq1-bravo', 'sq2'],
			memberCount: 6
		});
		expect(of('sq1')).toEqual({
			descendants: ['Alpha Team', 'Bravo Team'],
			ids: ['sq1', 'sq1-alpha', 'sq1-bravo'],
			memberCount: 4
		});
		expect(of('sq1-bravo')).toEqual({ descendants: [], ids: ['sq1-bravo'], memberCount: 1 });
		expect(of('plt2')).toEqual({ descendants: [], ids: ['plt2'], memberCount: 0 });
		expect(of('gone')).toBeNull();
	});
});

describe('canMoveUnder', () => {
	const parents = (id: string) =>
		[null, ...tree.ordered.map((node) => node.id)].filter((parentId) => canMoveUnder(tree, id, parentId));

	it('keeps a Group out of its own subtree, its current parent and below the third level', () => {
		expect(parents('sq1')).toEqual([null, 'plt2', 'hq']);
		expect(parents('sq2')).toEqual([null, 'sq1', 'plt2', 'hq']);
		expect(parents('sq1-alpha')).toEqual([null, 'plt1', 'sq2', 'plt2', 'hq']);
		expect(parents('plt1')).toEqual([]);
		expect(parents('hq')).toEqual(['plt1', 'sq1', 'sq2', 'plt2']);
	});
});

describe('addStandardSquads', () => {
	function recorder(existing: Group[]) {
		const calls: Array<[string, string]> = [];
		let next = 1;
		const create = async (name: string, parentId: string): Promise<Group> => {
			calls.push([name, parentId]);
			return { id: `new-${next++}`, name, sortOrder: 0, parentId, depth: 2 };
		};
		return { calls, run: (count: number) => addStandardSquads(existing, 'plt2', count, create) };
	}

	it('creates each squad under the platoon, then its Alpha and Bravo Teams under the squad', async () => {
		const { calls, run } = recorder(catalog);
		expect((await run(2)).map((group) => group.id)).toEqual(['new-1', 'new-2', 'new-3', 'new-4', 'new-5', 'new-6']);
		expect(calls).toEqual([
			['1st Squad', 'plt2'],
			['Alpha Team', 'new-1'],
			['Bravo Team', 'new-1'],
			['2nd Squad', 'plt2'],
			['Alpha Team', 'new-4'],
			['Bravo Team', 'new-4']
		]);
	});

	it('creates only what is missing when some squads and teams already exist', async () => {
		const { calls, run } = recorder([
			...catalog,
			{ id: 'p2-sq1', name: '1st squad', sortOrder: 0, parentId: 'plt2', depth: 2 },
			{ id: 'p2-sq1-alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'p2-sq1', depth: 3 }
		]);
		await run(2);
		expect(calls).toEqual([
			['Bravo Team', 'p2-sq1'],
			['2nd Squad', 'plt2'],
			['Alpha Team', 'new-2'],
			['Bravo Team', 'new-2']
		]);
	});
});

it.each([
	[1, '1st'],
	[2, '2nd'],
	[3, '3rd'],
	[4, '4th'],
	[11, '11th'],
	[12, '12th'],
	[13, '13th'],
	[21, '21st'],
	[22, '22nd']
])('writes %i as %s', (n, expected) => {
	expect(ordinal(n)).toBe(expected);
});
