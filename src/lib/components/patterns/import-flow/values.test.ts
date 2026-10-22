import { describe, expect, it } from 'vitest';
import { normalizeHeader, parseImportDate, parseValue } from './values';

describe('import values', () => {
	it.each([
		['2027-05-01', '2027-05-01'],
		['5/1/2027', '2027-05-01'],
		['01MAY27', '2027-05-01'],
		['1 May 2027', '2027-05-01'],
		['46508', '2027-05-01'],
		['1', '1900-01-01'],
		['59', '1900-02-28'],
		['61', '1900-03-01'],
		['60', null],
		['2027-02-29', null],
		['31APR27', null],
		['13/1/2027', null],
		['tomorrow', null],
		['', null],
		['NaN', null],
		['999999999999999', null]
	])('parses %s without guessing', (raw, expected) => {
		expect(parseImportDate(raw)).toBe(expected);
	});
	it('honors the 1904 date system without treating its day 60 as a fake date', () => {
		expect(parseImportDate('0', { date1904: true })).toBe('1904-01-01');
		expect(parseImportDate('60', { date1904: true })).toBe('1904-03-01');
		expect(parseImportDate('45046', { date1904: true })).toBe('2027-05-01');
	});
	it('parses blank, integer and text values and rejects invalid input', () => {
		expect(parseValue('date', ' ')).toEqual({ ok: true, value: null });
		expect(parseValue('integer', '-12')).toEqual({ ok: true, value: -12 });
		expect(parseValue('integer', '1.5').ok).toBe(false);
		expect(parseValue('integer', '9007199254740992').ok).toBe(false);
		expect(parseValue('text', ' Smith ', 5)).toEqual({ ok: true, value: 'Smith' });
		expect(parseValue('text', 'Smith', 4).ok).toBe(false);
		expect(normalizeHeader('\uFEFF Last   NAME ')).toBe('last name');
	});
});
