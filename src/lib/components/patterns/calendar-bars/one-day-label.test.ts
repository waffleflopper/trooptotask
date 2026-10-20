import { describe, expect, it } from 'vitest';
import { fitsOneDayLabel, normalizeShortLabel, oneDayLabel, suggestOneDayLabel } from './one-day-label';

describe('oneDayLabel', () => {
	it.each([
		['Sick', 'SIC'],
		['Appointment', 'APP'],
		['CQ/SD', 'CQS'],
		['  a b  cd ', 'ABC'],
		['3rd Shift', '3RD'],
		['ß', 'SS'],
		['Up', 'UP']
	])('derives %j as %j', (name, label) => {
		expect(suggestOneDayLabel(name)).toBe(label);
		expect(oneDayLabel({ name, shortLabel: null })).toBe(label);
	});

	it('shows a stored label over the derived one', () => {
		expect(oneDayLabel({ name: 'Sick', shortLabel: 'SK' })).toBe('SK');
	});

	it.each([
		[' sk ', 'SK'],
		['äöü', 'ÄÖÜ'],
		['', null],
		['   ', null]
	])('stores typed %j as %j', (typed, stored) => {
		expect(normalizeShortLabel(typed)).toBe(stored);
	});

	it.each([
		['ÄÖÜ', true],
		['👍👍👍', true],
		['ABCD', false]
	])('counts %j by code point: fits is %s', (label, fits) => {
		expect(fitsOneDayLabel(label)).toBe(fits);
	});
});
