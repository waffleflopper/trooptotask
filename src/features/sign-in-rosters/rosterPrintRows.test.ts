import { describe, expect, it } from 'vitest';
import { rosterDateLine, rosterPrintRows } from './rosterPrintRows';

const alphabetical = (a: string, b: string) => a.localeCompare(b);
const snapshot = [
	{ rank: 'SGT', lastName: 'Okafor', firstName: 'Daniel', group: 'Bravo' },
	{ rank: 'SPC', lastName: 'Nguyen', firstName: 'Theresa', group: 'Alpha' },
	{ rank: 'SPC', lastName: 'Liang', firstName: 'Wei', group: 'Bravo' },
	{ rank: 'PFC', lastName: 'Grant', firstName: 'Elise', group: '' }
];

describe('rosterPrintRows', () => {
	it('numbers people in snapshot order with no group rows when the roster is not split', () => {
		expect(rosterPrintRows(snapshot, false, alphabetical)).toEqual([
			{ kind: 'person', number: 1, rank: 'SGT', name: 'Okafor, Daniel' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Nguyen, Theresa' },
			{ kind: 'person', number: 3, rank: 'SPC', name: 'Liang, Wei' },
			{ kind: 'person', number: 4, rank: 'PFC', name: 'Grant, Elise' }
		]);
	});

	it('splits by group in group order, keeps snapshot order inside a group, and numbers straight through', () => {
		expect(rosterPrintRows(snapshot, true, alphabetical)).toEqual([
			{ kind: 'group', name: 'Unassigned' },
			{ kind: 'person', number: 1, rank: 'PFC', name: 'Grant, Elise' },
			{ kind: 'group', name: 'Alpha' },
			{ kind: 'person', number: 2, rank: 'SPC', name: 'Nguyen, Theresa' },
			{ kind: 'group', name: 'Bravo' },
			{ kind: 'person', number: 3, rank: 'SGT', name: 'Okafor, Daniel' },
			{ kind: 'person', number: 4, rank: 'SPC', name: 'Liang, Wei' }
		]);
	});

	it('is empty for nobody', () => {
		expect(rosterPrintRows([], true, alphabetical)).toEqual([]);
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
