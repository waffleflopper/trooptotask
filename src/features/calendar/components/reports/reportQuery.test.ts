import { describe, expect, it } from 'vitest';
import { parseReportQuery, reportRange, serializeReportQuery, shiftReportStart } from './reportQuery';

describe('parseReportQuery', () => {
	it('reads the lens, span and start from the address', () => {
		expect(parseReportQuery(new URLSearchParams('lens=time-away&days=60&start=2026-11-03'))).toEqual({
			lens: 'time-away',
			days: 60,
			start: '2026-11-03'
		});
	});

	it('falls back to Availability for 30 days from today when a value is missing or not one of the choices', () => {
		expect(parseReportQuery(new URLSearchParams('lens=forecast&days=45&start=2026-13-40'))).toEqual({
			lens: 'availability',
			days: 30,
			start: null
		});
		expect(parseReportQuery(new URLSearchParams(''))).toEqual({ lens: 'availability', days: 30, start: null });
	});
});

describe('serializeReportQuery', () => {
	it('leaves the plain page plain', () => {
		expect(serializeReportQuery({ lens: 'availability', days: 30, start: null }, '2026-11-03')).toBe('');
	});

	it('keeps a start that is not today and drops one that is', () => {
		expect(serializeReportQuery({ lens: 'availability', days: 14, start: '2026-12-03' }, '2026-11-03')).toBe(
			'days=14&start=2026-12-03'
		);
		expect(serializeReportQuery({ lens: 'assignment-load', days: 30, start: '2026-11-03' }, '2026-11-03')).toBe(
			'lens=assignment-load'
		);
	});
});

describe('reportRange', () => {
	it('spans the days from the start inclusive, across a month end', () => {
		expect(reportRange({ lens: 'availability', days: 30, start: null }, '2026-11-03')).toEqual({
			start: '2026-11-03',
			end: '2026-12-02'
		});
	});

	it('is unknown until today is known, unless the address names a start', () => {
		expect(reportRange({ lens: 'availability', days: 14, start: null }, null)).toBeNull();
		expect(reportRange({ lens: 'availability', days: 14, start: '2026-02-20' }, null)).toEqual({
			start: '2026-02-20',
			end: '2026-03-05'
		});
	});
});

describe('shiftReportStart', () => {
	const range = { start: '2026-11-03', end: '2026-12-02' };

	it('moves one span later or earlier', () => {
		expect(shiftReportStart(range, 30, 1)).toBe('2026-12-03');
		expect(shiftReportStart(range, 30, -1)).toBe('2026-10-04');
	});
});
