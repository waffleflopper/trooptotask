import { describe, expect, it } from 'vitest';
import { buildGroupTree, type Group } from '$features/personnel/contracts';
import { rosterDateLine, rosterPrintRows } from './rosterPrintRows';

const group = (id: string, name: string, sortOrder: number, parentId: string | null = null): Group => ({
	id,
	name,
	sortOrder,
	parentId,
	depth: 1
});
const groups = [group('group-b', 'Bravo', 0), group('group-a', 'Alpha', 1)];
const tree = buildGroupTree(groups);
const snapshot = [
	{ rank: 'SGT', lastName: 'Okafor', firstName: 'Daniel', group: 'Bravo', groupId: 'group-b' },
	{ rank: 'SPC', lastName: 'Nguyen', firstName: 'Theresa', group: 'Alpha', groupId: 'group-a' },
	{ rank: 'SPC', lastName: 'Liang', firstName: 'Wei', group: 'Bravo', groupId: 'group-b' },
	{ rank: 'PFC', lastName: 'Grant', firstName: 'Elise', group: '', groupId: null }
];
const whole = { separateByGroup: true, groupIds: [] } as const;
const headings = (rows: ReturnType<typeof rosterPrintRows>) =>
	rows.flatMap((row) => (row.kind === 'group' ? [row.name] : []));

describe('rosterPrintRows', () => {
	it('numbers people in snapshot order with no group rows when the roster is not split', () => {
		expect(rosterPrintRows(snapshot, { separateByGroup: false }, tree, groups)).toEqual([
			{ kind: 'person', number: 1, rank: 'SGT', name: 'Okafor, Daniel' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Nguyen, Theresa' },
			{ kind: 'person', number: 3, rank: 'SPC', name: 'Liang, Wei' },
			{ kind: 'person', number: 4, rank: 'PFC', name: 'Grant, Elise' }
		]);
	});

	it('splits by group in group order, keeps snapshot order inside a group, and numbers straight through', () => {
		expect(rosterPrintRows(snapshot, whole, tree, groups)).toEqual([
			{ kind: 'group', name: 'Bravo' },
			{ kind: 'person', number: 1, rank: 'SGT', name: 'Okafor, Daniel' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Liang, Wei' },
			{ kind: 'group', name: 'Alpha' },
			{ kind: 'person', number: 3, rank: 'SPC', name: 'Nguyen, Theresa' },
			{ kind: 'group', name: 'Unassigned' },
			{ kind: 'person', number: 4, rank: 'PFC', name: 'Grant, Elise' }
		]);
	});

	it('splits a Roster drawn from a platoon into its HQ and then each squad with its teams', () => {
		const nested = [
			group('p2', '2nd Platoon', 0),
			group('p2-s1', '1st Squad', 0, 'p2'),
			group('p2-s1-a', 'Alpha Team', 0, 'p2-s1'),
			group('p2-s2', '2nd Squad', 1, 'p2'),
			group('p1', '1st Platoon', 1)
		];
		const people = [
			{ rank: 'SPC', lastName: 'Team', firstName: 'Ann', group: 'Alpha Team', groupId: 'p2-s1-a' },
			{ rank: 'SSG', lastName: 'Second', firstName: 'Bo', group: '2nd Squad', groupId: 'p2-s2' },
			{ rank: 'SFC', lastName: 'Platoon', firstName: 'Cy', group: '2nd Platoon', groupId: 'p2' },
			{ rank: 'SSG', lastName: 'First', firstName: 'Di', group: '1st Squad', groupId: 'p2-s1' }
		];

		expect(
			rosterPrintRows(people, { separateByGroup: true, groupIds: ['p2'] }, buildGroupTree(nested), nested)
		).toEqual([
			{ kind: 'group', name: '2nd Platoon HQ' },
			{ kind: 'person', number: 1, rank: 'SFC', name: 'Platoon, Cy' },
			{ kind: 'group', name: '2nd Platoon › 1st Squad' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Team, Ann' },
			{ kind: 'person', number: 3, rank: 'SSG', name: 'First, Di' },
			{ kind: 'group', name: '2nd Platoon › 2nd Squad' },
			{ kind: 'person', number: 4, rank: 'SSG', name: 'Second, Bo' }
		]);
	});

	describe('a platoon Roster whose squad holds only team members', () => {
		const platoon = [group('p2', '2nd Platoon', 0), group('p2-s1', '1st Squad', 0, 'p2')];
		const saved = [
			{
				rank: 'SFC',
				lastName: 'Platoon',
				firstName: 'Cy',
				group: '2nd Platoon',
				groupId: 'p2',
				groupAncestors: []
			},
			{
				rank: 'SPC',
				lastName: 'Team',
				firstName: 'Ann',
				group: 'Alpha Team',
				groupId: 'p2-s1-a',
				groupAncestors: [
					{ id: 'p2', name: '2nd Platoon' },
					{ id: 'p2-s1', name: '1st Squad' }
				]
			}
		];
		const split = { separateByGroup: true, groupIds: ['p2'] } as const;
		const print = (people: typeof saved | Omit<(typeof saved)[number], 'groupAncestors'>[], live: Group[]) => {
			const catalog = [...live, group('p1', '1st Platoon', 1)];
			return rosterPrintRows(people, split, buildGroupTree(catalog), catalog);
		};

		it('labels the squad with its saved name after the squad is renamed', () => {
			const renamed = [
				group('p2', '2nd Platoon', 0),
				group('p2-s1', 'Renamed Squad', 0, 'p2'),
				group('p2-s1-a', 'Alpha Team', 0, 'p2-s1')
			];

			expect(print(saved, renamed)).toEqual([
				{ kind: 'group', name: '2nd Platoon HQ' },
				{ kind: 'person', number: 1, rank: 'SFC', name: 'Platoon, Cy' },
				{ kind: 'group', name: '2nd Platoon › 1st Squad' },
				{ kind: 'person', number: 2, rank: 'SPC', name: 'Team, Ann' }
			]);
		});

		it('prints a Roster saved before Groups nested, filling the never-saved squad with its current name', () => {
			const legacy = saved.map(({ groupAncestors: _ancestors, ...person }) => person);
			const renamed = [
				group('p2', '2nd Platoon', 0),
				group('p2-s1', 'Renamed Squad', 0, 'p2'),
				group('p2-s1-a', 'Renamed Team', 0, 'p2-s1')
			];

			expect(print(legacy, renamed)).toEqual([
				{ kind: 'group', name: '2nd Platoon HQ' },
				{ kind: 'person', number: 1, rank: 'SFC', name: 'Platoon, Cy' },
				{ kind: 'group', name: '2nd Platoon › Renamed Squad' },
				{ kind: 'person', number: 2, rank: 'SPC', name: 'Team, Ann' }
			]);
		});

		it("prints a deleted Group's people where the Roster saved them", () => {
			expect(print(saved, platoon)).toEqual([
				{ kind: 'group', name: '2nd Platoon HQ' },
				{ kind: 'person', number: 1, rank: 'SFC', name: 'Platoon, Cy' },
				{ kind: 'group', name: '2nd Platoon › 1st Squad' },
				{ kind: 'person', number: 2, rank: 'SPC', name: 'Team, Ann' }
			]);
		});

		it('keeps the saved platoon after the squad moves to another platoon', () => {
			const moved = [
				group('p2', '2nd Platoon', 0),
				group('p3', '3rd Platoon', 2),
				group('p2-s1', '1st Squad', 0, 'p3'),
				group('p2-s1-a', 'Alpha Team', 0, 'p2-s1')
			];

			expect(print(saved, moved)).toEqual([
				{ kind: 'group', name: '2nd Platoon HQ' },
				{ kind: 'person', number: 1, rank: 'SFC', name: 'Platoon, Cy' },
				{ kind: 'group', name: '2nd Platoon › 1st Squad' },
				{ kind: 'person', number: 2, rank: 'SPC', name: 'Team, Ann' }
			]);
		});

		it.each([
			{ reader: 'scoped to the squad', live: [group('p2-s1', '1st Squad', 0, 'p2')] },
			{
				reader: 'who sees only the platoon',
				live: [group('p2', '2nd Platoon', 0), group('p2-s1', '1st Squad', 0, 'p2')]
			}
		])('keeps the saved platoon in the path for a reader $reader', ({ live }) => {
			expect(headings(rosterPrintRows(saved, split, buildGroupTree(live), live))).toEqual([
				'2nd Platoon HQ',
				'2nd Platoon › 1st Squad'
			]);
		});
	});

	it('orders a Roster saved without Group ids by the current catalog and pins', () => {
		const legacy = snapshot.map(({ groupId: _groupId, ...person }) => person);
		const pinned = buildGroupTree(groups, { pinnedIds: ['group-a'] });

		expect(headings(rosterPrintRows(legacy, whole, tree, groups))).toEqual(['Bravo', 'Alpha', 'Unassigned']);
		expect(headings(rosterPrintRows(legacy, whole, pinned, groups))).toEqual(['Alpha', 'Bravo', 'Unassigned']);
	});

	it('falls back to the saved name when a legacy Group name is gone or repeated', () => {
		const legacy = [
			{ rank: 'SGT', lastName: 'Okafor', firstName: 'Daniel', group: 'Zulu' },
			{ rank: 'SPC', lastName: 'Nguyen', firstName: 'Theresa', group: 'Bravo' }
		];
		const repeated = [...groups, group('group-b2', 'Bravo', 2)];

		expect(headings(rosterPrintRows(legacy, whole, tree, groups))).toEqual(['Bravo', 'Zulu']);
		expect(headings(rosterPrintRows(legacy, whole, buildGroupTree(repeated), repeated))).toEqual(['Bravo', 'Zulu']);
	});

	it('labels sections with the Group names saved with the Roster', () => {
		const renamed = [group('group-b', 'Bravo', 0), group('group-a', 'Renamed Alpha', 1)];

		expect(headings(rosterPrintRows(snapshot, whole, buildGroupTree(renamed), renamed))).toEqual([
			'Bravo',
			'Alpha',
			'Unassigned'
		]);
	});

	it('is empty for nobody', () => {
		expect(rosterPrintRows([], whole, tree, groups)).toEqual([]);
	});
});

describe('rosterDateLine', () => {
	it('writes a chosen day in full', () => {
		expect(rosterDateLine('2026-10-28', false)).toBe('Date: October 28, 2026');
	});

	it('leaves a line to write on when the date is blank', () => {
		expect(rosterDateLine('2026-10-28', true)).toBe('Date: _______________');
		expect(rosterDateLine(null, false)).toBe('Date: _______________');
	});
});
