import { describe, expect, it } from 'vitest';
import { formatDate } from '$lib/utils/dates';
import {
	calendarPeriod,
	calendarViewCoverage,
	chunkCalendarReadRange,
	extendLoadedRange,
	getCalendarRangeGaps,
	initialCalendarCoverage,
	planCalendarRangeReads,
	shiftCalendarPeriod,
	type CalendarBufferedRange
} from './calendarRange';

describe('calendarViewCoverage', () => {
	it('reads availability for the visible month and assignments from 90 days before it, across a year boundary', () => {
		expect(calendarViewCoverage(new Date(2027, 0, 15), 'month', '2027-01-15')).toEqual({
			availability: { rangeStart: '2027-01-01', rangeEnd: '2027-01-31' },
			assignments: { rangeStart: '2026-10-03', rangeEnd: '2027-01-31' }
		});
	});

	it('reads all three months of a 3-Month view that ends in the next year', () => {
		expect(calendarViewCoverage(new Date(2026, 10, 18), '3-month', '2026-11-18')).toEqual({
			availability: { rangeStart: '2026-11-01', rangeEnd: '2027-01-31' },
			assignments: { rangeStart: '2026-08-03', rangeEnd: '2027-01-31' }
		});
	});

	it('starts availability at today when today falls inside the lookback, and not when it falls before it', () => {
		expect(calendarViewCoverage(new Date(2026, 10, 1), 'month', '2026-10-20').availability).toEqual({
			rangeStart: '2026-10-20',
			rangeEnd: '2026-11-30'
		});
		expect(calendarViewCoverage(new Date(2027, 2, 1), 'month', '2026-10-20').availability).toEqual({
			rangeStart: '2027-03-01',
			rangeEnd: '2027-03-31'
		});
	});

	it('seeds the bootstrap with the anchor month and the month after it', () => {
		expect(initialCalendarCoverage(new Date(2026, 3, 10), '2026-04-10')).toEqual({
			availability: { rangeStart: '2026-04-01', rangeEnd: '2026-05-31' },
			assignments: { rangeStart: '2026-01-01', rangeEnd: '2026-05-31' }
		});
	});

	it('starts availability for a later anchor month on the day before the server day, so a viewer still on yesterday needs no read', () => {
		expect(initialCalendarCoverage(new Date(2026, 10, 1), '2026-10-21')).toEqual({
			availability: { rangeStart: '2026-10-20', rangeEnd: '2026-12-31' },
			assignments: { rangeStart: '2026-08-03', rangeEnd: '2026-12-31' }
		});
		expect(
			planCalendarRangeReads(
				initialCalendarCoverage(new Date(2026, 10, 1), '2026-10-21'),
				calendarViewCoverage(new Date(2026, 10, 1), 'month', '2026-10-20')
			)
		).toEqual([]);
	});

	it('covers viewers behind, on and ahead of the server day when the lookback starts on the server day', () => {
		const january = new Date(2027, 0, 1);
		expect(initialCalendarCoverage(january, '2026-10-03')).toEqual({
			availability: { rangeStart: '2026-10-03', rangeEnd: '2027-02-28' },
			assignments: { rangeStart: '2026-10-03', rangeEnd: '2027-02-28' }
		});
		expect(
			['2026-10-02', '2026-10-03', '2026-10-04'].map((viewerDay) =>
				planCalendarRangeReads(
					initialCalendarCoverage(january, '2026-10-03'),
					calendarViewCoverage(january, 'month', viewerDay)
				)
			)
		).toEqual([[], [], []]);
	});

	it('starts availability where the lookback starts for a server day just before or after it', () => {
		const january = new Date(2027, 0, 1);
		expect(initialCalendarCoverage(january, '2026-10-02').availability.rangeStart).toBe('2026-10-03');
		expect(initialCalendarCoverage(january, '2026-10-04').availability.rangeStart).toBe('2026-10-03');
		expect(initialCalendarCoverage(january, '2026-10-01').availability.rangeStart).toBe('2027-01-01');
	});
});

describe('planCalendarRangeReads', () => {
	const loaded = {
		availability: { rangeStart: '2026-10-01', rangeEnd: '2026-11-30' },
		assignments: { rangeStart: '2026-07-03', rangeEnd: '2026-11-30' }
	};

	it('reads nothing for the next month the bootstrap already holds', () => {
		expect(planCalendarRangeReads(loaded, calendarViewCoverage(new Date(2026, 10, 1), 'month', '2026-10-20'))).toEqual(
			[]
		);
	});

	it('shares one read when both collections miss the same month', () => {
		expect(planCalendarRangeReads(loaded, calendarViewCoverage(new Date(2026, 11, 1), 'month', '2026-10-20'))).toEqual([
			{ rangeStart: '2026-12-01', rangeEnd: '2026-12-31', collections: ['availability', 'assignments'] }
		]);
	});

	it('reads the previous month of availability and only the lookback prefix of assignments', () => {
		expect(planCalendarRangeReads(loaded, calendarViewCoverage(new Date(2026, 8, 1), 'month', '2026-10-20'))).toEqual([
			{ rangeStart: '2026-09-01', rangeEnd: '2026-09-30', collections: ['availability'] },
			{ rangeStart: '2026-06-03', rangeEnd: '2026-07-02', collections: ['assignments'] }
		]);
	});

	it('reads only the collections a need names', () => {
		expect(
			planCalendarRangeReads(loaded, { availability: { rangeStart: '2026-12-10', rangeEnd: '2026-12-12' } })
		).toEqual([{ rangeStart: '2026-12-10', rangeEnd: '2026-12-12', collections: ['availability'] }]);
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
		const jumped = calendarViewCoverage(new Date(2028, 3, 1), 'month', '2026-04-10').assignments;

		expect(
			getCalendarRangeGaps(initialCalendarCoverage(new Date(2026, 3, 10), '2026-04-10').assignments, jumped)
		).toEqual([{ rangeStart: '2028-01-02', rangeEnd: '2028-04-30' }]);
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
