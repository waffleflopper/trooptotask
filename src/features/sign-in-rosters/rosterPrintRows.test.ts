import { describe, expect, it } from 'vitest';
import { compareRosterBands } from '$features/personnel/contracts';
import { rosterDateLine, rosterPrintRows } from './rosterPrintRows';

const groups = [
	{ id: 'group-b', name: 'Bravo', sortOrder: 0 },
	{ id: 'group-a', name: 'Alpha', sortOrder: 1 }
];
const compareBands = compareRosterBands({ groups, pinnedGroupIds: [] });
const snapshot = [
	{ rank: 'SGT', lastName: 'Okafor', firstName: 'Daniel', group: 'Bravo', groupId: 'group-b' },
	{ rank: 'SPC', lastName: 'Nguyen', firstName: 'Theresa', group: 'Alpha', groupId: 'group-a' },
	{ rank: 'SPC', lastName: 'Liang', firstName: 'Wei', group: 'Bravo', groupId: 'group-b' },
	{ rank: 'PFC', lastName: 'Grant', firstName: 'Elise', group: '', groupId: null }
];

describe('rosterPrintRows', () => {
	it('numbers people in snapshot order with no group rows when the roster is not split', () => {
		expect(rosterPrintRows(snapshot, false, compareBands, groups)).toEqual([
			{ kind: 'person', number: 1, rank: 'SGT', name: 'Okafor, Daniel' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Nguyen, Theresa' },
			{ kind: 'person', number: 3, rank: 'SPC', name: 'Liang, Wei' },
			{ kind: 'person', number: 4, rank: 'PFC', name: 'Grant, Elise' }
		]);
	});

	it('splits by group in group order, keeps snapshot order inside a group, and numbers straight through', () => {
		expect(rosterPrintRows(snapshot, true, compareBands, groups)).toEqual([
			{ kind: 'group', name: 'Bravo' },
			{ kind: 'person', number: 1, rank: 'SGT', name: 'Okafor, Daniel' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Liang, Wei' },
			{ kind: 'group', name: 'Alpha' },
			{ kind: 'person', number: 3, rank: 'SPC', name: 'Nguyen, Theresa' },
			{ kind: 'group', name: 'Unassigned' },
			{ kind: 'person', number: 4, rank: 'PFC', name: 'Grant, Elise' }
		]);
	});

	it('orders a Roster saved without Group ids by the current catalog and pins', () => {
		const legacy = snapshot.map(({ groupId: _groupId, ...person }) => person);
		const pinned = compareRosterBands({ groups, pinnedGroupIds: ['group-a'] });

		expect(rosterPrintRows(legacy, true, compareBands, groups).filter((row) => row.kind === 'group')).toEqual([
			{ kind: 'group', name: 'Bravo' },
			{ kind: 'group', name: 'Alpha' },
			{ kind: 'group', name: 'Unassigned' }
		]);
		expect(rosterPrintRows(legacy, true, pinned, groups).filter((row) => row.kind === 'group')).toEqual([
			{ kind: 'group', name: 'Alpha' },
			{ kind: 'group', name: 'Bravo' },
			{ kind: 'group', name: 'Unassigned' }
		]);
	});

	it('falls back to the saved name when a legacy Group name is gone or repeated', () => {
		const legacy = [
			{ rank: 'SGT', lastName: 'Okafor', firstName: 'Daniel', group: 'Zulu' },
			{ rank: 'SPC', lastName: 'Nguyen', firstName: 'Theresa', group: 'Bravo' }
		];
		const repeated = [...groups, { id: 'group-b2', name: 'Bravo', sortOrder: 2 }];

		expect(
			rosterPrintRows(legacy, true, compareRosterBands({ groups, pinnedGroupIds: [] }), groups)
				.filter((row) => row.kind === 'group')
				.map((row) => row.name)
		).toEqual(['Bravo', 'Zulu']);
		expect(
			rosterPrintRows(legacy, true, compareRosterBands({ groups: repeated, pinnedGroupIds: ['group-b2'] }), repeated)
				.filter((row) => row.kind === 'group')
				.map((row) => row.name)
		).toEqual(['Bravo', 'Zulu']);
	});

	it('is empty for nobody', () => {
		expect(rosterPrintRows([], true, compareBands, groups)).toEqual([]);
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
