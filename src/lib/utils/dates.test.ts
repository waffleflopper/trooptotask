import { describe, it, expect, vi } from 'vitest';
import {
	formatDate,
	formatToday,
	parseDate,
	getMonthDates,
	isWeekend,
	isSameDay,
	isDateInRange,
	getMonthName,
	getDayName,
	addMonths,
	startOfMonth,
	endOfMonth,
	formatDisplayDate,
	isDateOnly,
	isTimeZone,
	localDateIn,
	calendarDayDiff,
	formatRelativeDate
} from './dates';

function withTimeZone(timeZone: string, run: () => void) {
	const originalTimezone = process.env.TZ;
	process.env.TZ = timeZone;
	try {
		run();
	} finally {
		if (originalTimezone === undefined) delete process.env.TZ;
		else process.env.TZ = originalTimezone;
	}
}

describe('localDateIn', () => {
	it('returns the calendar day in the named zone on either side of UTC midnight', () => {
		expect(localDateIn('America/New_York', new Date('2026-10-15T00:30:00Z'))).toBe('2026-10-14');
		expect(localDateIn('Asia/Seoul', new Date('2026-10-14T23:30:00Z'))).toBe('2026-10-15');
	});
});

describe('isTimeZone', () => {
	it.each(['America/New_York', 'UTC', 'Etc/GMT+5', 'America/Argentina/Buenos_Aires'])('accepts %s', (value) => {
		expect(isTimeZone(value)).toBe(true);
	});

	it.each(['Mars/Base', '', 'a'.repeat(65), 'America/New_York; Path=/', '+05:00', null, 42])('rejects %j', (value) => {
		expect(isTimeZone(value)).toBe(false);
	});
});

describe('calendarDayDiff', () => {
	it('counts whole calendar days across both daylight-saving changes', () => {
		withTimeZone('America/New_York', () => {
			expect(calendarDayDiff(new Date(2026, 2, 7, 23, 30), new Date(2026, 2, 9, 0, 15))).toBe(2);
			expect(calendarDayDiff(new Date(2026, 9, 31, 0, 30), new Date(2026, 10, 2, 23, 30))).toBe(2);
			expect(calendarDayDiff(new Date(2026, 10, 2), new Date(2026, 9, 31))).toBe(-2);
		});
	});
});

describe('formatRelativeDate', () => {
	it('counts calendar days, so 23:00 seen at 08:00 is yesterday', () => {
		withTimeZone('America/New_York', () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2026, 9, 14, 8, 0));
			try {
				expect(formatRelativeDate(new Date(2026, 9, 13, 23, 0).toISOString())).toBe('yesterday');
				expect(formatRelativeDate(new Date(2026, 9, 14, 0, 5).toISOString())).toBe('today');
				expect(formatRelativeDate(new Date(2026, 9, 14, 9, 0).toISOString())).toBe('today');
				expect(formatRelativeDate(new Date(2026, 9, 11, 7, 0).toISOString())).toBe('3 days ago');
			} finally {
				vi.useRealTimers();
			}
		});
	});
});

describe('isDateOnly', () => {
	it.each(['2026-02-28', '2028-02-29', '2000-02-29', '2026-12-31', '1000-01-01'])(
		'accepts the calendar date %s',
		(value) => {
			expect(isDateOnly(value)).toBe(true);
		}
	);

	it.each([
		'2026-02-29',
		'1900-02-29',
		'2026-02-30',
		'2026-04-31',
		'2026-13-01',
		'2026-00-10',
		'2026-01-00',
		'0000-01-01',
		'0099-01-01',
		'0999-12-31',
		'2026-1-01',
		'2026-01-1',
		'2026-01-01T00:00:00Z',
		'2026-01-01 ',
		' 2026-01-01',
		'not-a-date',
		''
	])('rejects %j', (value) => {
		expect(isDateOnly(value)).toBe(false);
	});

	it.each([null, undefined, 20260101, new Date('2026-01-01')])('rejects the non-string %s', (value) => {
		expect(isDateOnly(value)).toBe(false);
	});
});

describe('formatDate', () => {
	it('formats a date as YYYY-MM-DD', () => {
		expect(formatDate(new Date(2026, 2, 13))).toBe('2026-03-13');
	});

	it('pads single-digit months and days', () => {
		expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
	});
});

describe('formatToday', () => {
	it('uses the local calendar date near a UTC midnight boundary', () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/Anchorage';
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-05T02:00:00.000Z'));

		try {
			expect(formatToday()).toBe('2026-05-04');
		} finally {
			vi.useRealTimers();
			if (originalTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimezone;
			}
		}
	});
});

describe('parseDate', () => {
	it('parses YYYY-MM-DD into a Date', () => {
		const d = parseDate('2026-03-13');
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(2); // March = 2
		expect(d.getDate()).toBe(13);
	});
});

describe('getMonthDates', () => {
	it('returns all dates for March 2026', () => {
		const dates = getMonthDates(2026, 2); // March
		expect(dates).toHaveLength(31);
		expect(dates[0].getDate()).toBe(1);
		expect(dates[30].getDate()).toBe(31);
	});

	it('returns 28 days for February 2026 (non-leap year)', () => {
		const dates = getMonthDates(2026, 1);
		expect(dates).toHaveLength(28);
	});

	it('returns 29 days for February 2028 (leap year)', () => {
		const dates = getMonthDates(2028, 1);
		expect(dates).toHaveLength(29);
	});
});

describe('isWeekend', () => {
	it('returns true for Saturday', () => {
		expect(isWeekend(new Date(2026, 2, 14))).toBe(true); // Saturday
	});

	it('returns true for Sunday', () => {
		expect(isWeekend(new Date(2026, 2, 15))).toBe(true); // Sunday
	});

	it('returns false for weekdays', () => {
		expect(isWeekend(new Date(2026, 2, 13))).toBe(false); // Friday
		expect(isWeekend(new Date(2026, 2, 9))).toBe(false); // Monday
	});
});

describe('isSameDay', () => {
	it('returns true for same date', () => {
		expect(isSameDay(new Date(2026, 2, 13), new Date(2026, 2, 13))).toBe(true);
	});

	it('returns true for same date different times', () => {
		expect(isSameDay(new Date(2026, 2, 13, 8, 0), new Date(2026, 2, 13, 20, 0))).toBe(true);
	});

	it('returns false for different dates', () => {
		expect(isSameDay(new Date(2026, 2, 13), new Date(2026, 2, 14))).toBe(false);
	});
});

describe('isDateInRange', () => {
	it('returns true when date is within range', () => {
		expect(isDateInRange(new Date(2026, 2, 13), '2026-03-01', '2026-03-31')).toBe(true);
	});

	it('returns true for start boundary', () => {
		expect(isDateInRange(new Date(2026, 2, 1), '2026-03-01', '2026-03-31')).toBe(true);
	});

	it('returns true for end boundary', () => {
		expect(isDateInRange(new Date(2026, 2, 31), '2026-03-01', '2026-03-31')).toBe(true);
	});

	it('returns false when date is outside range', () => {
		expect(isDateInRange(new Date(2026, 3, 1), '2026-03-01', '2026-03-31')).toBe(false);
	});
});

describe('getMonthName', () => {
	it('returns correct month names', () => {
		expect(getMonthName(0)).toBe('January');
		expect(getMonthName(2)).toBe('March');
		expect(getMonthName(11)).toBe('December');
	});
});

describe('getDayName', () => {
	it('returns short day name by default', () => {
		expect(getDayName(new Date(2026, 2, 13))).toBe('Fri'); // Friday
	});

	it('returns full day name when short=false', () => {
		expect(getDayName(new Date(2026, 2, 13), false)).toBe('Friday');
	});
});

describe('addMonths', () => {
	it('adds months forward', () => {
		const result = addMonths(new Date(2026, 2, 1), 1);
		expect(result.getMonth()).toBe(3); // April
	});

	it('subtracts months backward', () => {
		const result = addMonths(new Date(2026, 2, 1), -1);
		expect(result.getMonth()).toBe(1); // February
	});

	it('wraps year boundary', () => {
		const result = addMonths(new Date(2026, 11, 1), 1);
		expect(result.getFullYear()).toBe(2027);
		expect(result.getMonth()).toBe(0); // January
	});
});

describe('startOfMonth', () => {
	it('returns first day of month', () => {
		const result = startOfMonth(new Date(2026, 2, 13));
		expect(result.getDate()).toBe(1);
		expect(result.getMonth()).toBe(2);
	});
});

describe('endOfMonth', () => {
	it('returns last day of month', () => {
		const result = endOfMonth(new Date(2026, 2, 13));
		expect(result.getDate()).toBe(31);
		expect(result.getMonth()).toBe(2);
	});

	it('handles February correctly', () => {
		const result = endOfMonth(new Date(2026, 1, 10));
		expect(result.getDate()).toBe(28);
	});
});

describe('formatDisplayDate', () => {
	it('formats a date string for display', () => {
		const result = formatDisplayDate('2026-03-13');
		expect(result).toContain('Mar');
		expect(result).toContain('13');
		expect(result).toContain('2026');
	});

	it('returns dash for null', () => {
		expect(formatDisplayDate(null)).toBe('-');
	});
});
