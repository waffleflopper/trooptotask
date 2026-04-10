import { describe, expect, it } from 'vitest';
import {
	createInitialCalendarBufferedRange,
	createVisibleCalendarRange,
	getCalendarRangeGaps,
	type CalendarBufferedRange
} from './calendarRange';

describe('calendarRange', () => {
	it('creates the initial buffered range as the active month plus a one-month buffer on each side', () => {
		expect(createInitialCalendarBufferedRange(new Date(2026, 3, 10))).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-05-31'
		});
	});

	it('creates the visible 3-month range from the active month through the next two months', () => {
		expect(createVisibleCalendarRange(new Date(2026, 3, 10), '3-month')).toEqual({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-06-30'
		});
	});

	it('returns no expansion when the visible range is already buffered', () => {
		const bufferedRange: CalendarBufferedRange = {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-05-31'
		};

		expect(getCalendarRangeGaps(bufferedRange, createVisibleCalendarRange(new Date(2026, 3, 10), 'month'))).toEqual([]);
	});

	it('returns only the uncovered trailing slice needed to cover a later visible range', () => {
		const bufferedRange: CalendarBufferedRange = {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-05-31'
		};

		expect(getCalendarRangeGaps(bufferedRange, createVisibleCalendarRange(new Date(2026, 3, 10), '3-month'))).toEqual([
			{
				rangeStart: '2026-06-01',
				rangeEnd: '2026-06-30'
			}
		]);
	});

	it('returns both uncovered slices when a wider visible range extends before and after the current buffer', () => {
		const bufferedRange: CalendarBufferedRange = {
			rangeStart: '2026-04-01',
			rangeEnd: '2026-04-30'
		};

		expect(getCalendarRangeGaps(bufferedRange, { rangeStart: '2026-03-01', rangeEnd: '2026-05-31' })).toEqual([
			{
				rangeStart: '2026-03-01',
				rangeEnd: '2026-03-31'
			},
			{
				rangeStart: '2026-05-01',
				rangeEnd: '2026-05-31'
			}
		]);
	});
});
