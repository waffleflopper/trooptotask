import { describe, expect, it } from 'vitest';
import { compareRosterBands } from '$features/personnel/contracts';
import { rosterDateLine, rosterPrintRows } from './rosterPrintRows';

const compareBands = compareRosterBands({
	groups: [
		{ id: 'group-b', name: 'Bravo', sortOrder: 0 },
		{ id: 'group-a', name: 'Alpha', sortOrder: 1 }
	],
	pinnedGroupIds: []
});
const snapshot = [
	{ rank: 'SGT', lastName: 'Okafor', firstName: 'Daniel', group: 'Bravo', groupId: 'group-b' },
	{ rank: 'SPC', lastName: 'Nguyen', firstName: 'Theresa', group: 'Alpha', groupId: 'group-a' },
	{ rank: 'SPC', lastName: 'Liang', firstName: 'Wei', group: 'Bravo', groupId: 'group-b' },
	{ rank: 'PFC', lastName: 'Grant', firstName: 'Elise', group: '', groupId: null }
];

describe('rosterPrintRows', () => {
	it('numbers people in snapshot order with no group rows when the roster is not split', () => {
		expect(rosterPrintRows(snapshot, false, compareBands)).toEqual([
			{ kind: 'person', number: 1, rank: 'SGT', name: 'Okafor, Daniel' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Nguyen, Theresa' },
			{ kind: 'person', number: 3, rank: 'SPC', name: 'Liang, Wei' },
			{ kind: 'person', number: 4, rank: 'PFC', name: 'Grant, Elise' }
		]);
	});

	it('splits by group in group order, keeps snapshot order inside a group, and numbers straight through', () => {
		expect(rosterPrintRows(snapshot, true, compareBands)).toEqual([
			{ kind: 'group', name: 'Bravo' },
			{ kind: 'person', number: 1, rank: 'SGT', name: 'Okafor, Daniel' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Liang, Wei' },
			{ kind: 'group', name: 'Alpha' },
			{ kind: 'person', number: 3, rank: 'SPC', name: 'Nguyen, Theresa' },
			{ kind: 'group', name: 'Unassigned' },
			{ kind: 'person', number: 4, rank: 'PFC', name: 'Grant, Elise' }
		]);
	});

	it('splits a Roster saved without Group ids by the saved Group name', () => {
		const legacy = snapshot.map(({ groupId: _groupId, ...person }) => person);

		expect(rosterPrintRows(legacy, true, compareBands).filter((row) => row.kind === 'group')).toEqual([
			{ kind: 'group', name: 'Alpha' },
			{ kind: 'group', name: 'Bravo' },
			{ kind: 'group', name: 'Unassigned' }
		]);
	});

	it('is empty for nobody', () => {
		expect(rosterPrintRows([], true, compareBands)).toEqual([]);
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
