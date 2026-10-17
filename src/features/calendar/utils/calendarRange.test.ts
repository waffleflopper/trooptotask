import { describe, expect, it } from 'vitest';
import { formatDate } from '$lib/utils/dates';
import {
	calendarPeriod,
	calendarReadRange,
	chunkCalendarReadRange,
	createInitialCalendarBufferedRange,
	extendLoadedRange,
	getCalendarRangeGaps,
	shiftCalendarPeriod,
	type CalendarBufferedRange
} from './calendarRange';

describe('calendarReadRange', () => {
	it('reads the visible month plus the 90 days before it, across a year boundary', () => {
		expect(calendarReadRange(new Date(2027, 0, 15), 'month')).toEqual({
			rangeStart: '2026-10-03',
			rangeEnd: '2027-01-31'
		});
	});

	it('reads all three months of a 3-Month view that ends in the next year', () => {
		expect(calendarReadRange(new Date(2026, 10, 18), '3-month')).toEqual({
			rangeStart: '2026-08-03',
			rangeEnd: '2027-01-31'
		});
	});

	it('seeds the bootstrap from the month read range start through the end of next month', () => {
		expect(createInitialCalendarBufferedRange(new Date(2026, 3, 10))).toEqual({
			rangeStart: '2026-01-01',
			rangeEnd: '2026-05-31'
		});
	});
});

describe('getCalendarRangeGaps', () => {
	const loaded: CalendarBufferedRange = { rangeStart: '2026-03-01', rangeEnd: '2026-05-31' };

	it('returns nothing for a request inside the loaded span', () => {
		expect(getCalendarRangeGaps(loaded, { rangeStart: '2026-04-01', rangeEnd: '2026-04-30' })).toEqual([]);
	});

	it('returns only the overlapping request tail that is not loaded', () => {
		expect(getCalendarRangeGaps(loaded, { rangeStart: '2026-04-15', rangeEnd: '2026-06-20' })).toEqual([
			{ rangeStart: '2026-06-01', rangeEnd: '2026-06-20' }
		]);
	});

	it('returns both uncovered edges of a request wider than the loaded span', () => {
		expect(
			getCalendarRangeGaps(
				{ rangeStart: '2026-04-01', rangeEnd: '2026-04-30' },
				{ rangeStart: '2026-03-01', rangeEnd: '2026-05-31' }
			)
		).toEqual([
			{ rangeStart: '2026-03-01', rangeEnd: '2026-03-31' },
			{ rangeStart: '2026-05-01', rangeEnd: '2026-05-31' }
		]);
	});

	it('returns only the far request after a two-year jump, not the unread years between', () => {
		const jumped = calendarReadRange(new Date(2028, 3, 1), 'month');

		expect(getCalendarRangeGaps(createInitialCalendarBufferedRange(new Date(2026, 3, 10)), jumped)).toEqual([
			{ rangeStart: '2028-01-02', rangeEnd: '2028-04-30' }
		]);
	});
});

describe('extendLoadedRange', () => {
	const loaded: CalendarBufferedRange = { rangeStart: '2026-03-01', rangeEnd: '2026-04-30' };

	it('starts from the read when nothing is loaded', () => {
		expect(extendLoadedRange(null, loaded)).toEqual({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' });
	});

	it('forms the union with an overlapping read', () => {
		expect(extendLoadedRange(loaded, { rangeStart: '2026-04-15', rangeEnd: '2026-06-30' })).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-06-30'
		});
	});

	it('forms the union with a read that starts the day after the loaded end', () => {
		expect(extendLoadedRange(loaded, { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' })).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-05-31'
		});
	});

	it('replaces the loaded span with a read separated from it by one unread day', () => {
		expect(extendLoadedRange(loaded, { rangeStart: '2026-01-01', rangeEnd: '2026-02-27' })).toEqual({
			rangeStart: '2026-01-01',
			rangeEnd: '2026-02-27'
		});
	});
});

describe('chunkCalendarReadRange', () => {
	it('keeps a 366-day span as one read', () => {
		expect(chunkCalendarReadRange({ rangeStart: '2026-01-01', rangeEnd: '2027-01-01' })).toEqual([
			{ rangeStart: '2026-01-01', rangeEnd: '2027-01-01' }
		]);
	});

	it('splits a 367-day span into a full read and its last day', () => {
		expect(chunkCalendarReadRange({ rangeStart: '2026-01-01', rangeEnd: '2027-01-02' })).toEqual([
			{ rangeStart: '2026-01-01', rangeEnd: '2027-01-01' },
			{ rangeStart: '2027-01-02', rangeEnd: '2027-01-02' }
		]);
	});

	it('splits an 800-day span into adjacent reads of at most 366 days', () => {
		expect(chunkCalendarReadRange({ rangeStart: '2026-01-01', rangeEnd: '2028-03-10' })).toEqual([
			{ rangeStart: '2026-01-01', rangeEnd: '2027-01-01' },
			{ rangeStart: '2027-01-02', rangeEnd: '2028-01-02' },
			{ rangeStart: '2028-01-03', rangeEnd: '2028-03-10' }
		]);
	});
});

describe('calendarPeriod', () => {
	it('names one month in Month and three months across a year boundary in 3-Month', () => {
		expect(calendarPeriod(new Date(2026, 10, 18), 'month').title).toBe('November 2026');
		expect(calendarPeriod(new Date(2026, 10, 18), '3-month').title).toBe('November 2026 – January 2027');
	});

	it('steps one month in Month and three in 3-Month, landing on the first of the month', () => {
		const anchor = new Date(2026, 11, 31);
		expect(formatDate(shiftCalendarPeriod(anchor, 'month', 1))).toBe('2027-01-01');
		expect(formatDate(shiftCalendarPeriod(anchor, 'month', -1))).toBe('2026-11-01');
		expect(formatDate(shiftCalendarPeriod(anchor, '3-month', 1))).toBe('2027-03-01');
		expect(formatDate(shiftCalendarPeriod(new Date(2027, 0, 15), '3-month', -1))).toBe('2026-10-01');
	});
});
