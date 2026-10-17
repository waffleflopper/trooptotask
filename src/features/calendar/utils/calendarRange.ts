import { endOfMonth, formatDate, getMonthName } from '$lib/utils/dates';
import { fromDayNumber, toDayNumber } from './dayNumber';

export interface CalendarBufferedRange {
	rangeStart: string;
	rangeEnd: string;
}

export type CalendarViewMode = 'month' | '3-month';

export interface CalendarPeriod {
	readonly start: Date;
	readonly months: number;
	readonly title: string;
	readonly previousLabel: string;
	readonly nextLabel: string;
}

const PERIODS: Record<CalendarViewMode, Pick<CalendarPeriod, 'months' | 'previousLabel' | 'nextLabel'>> = {
	month: { months: 1, previousLabel: 'Previous month', nextLabel: 'Next month' },
	'3-month': { months: 3, previousLabel: 'Previous 3 months', nextLabel: 'Next 3 months' }
};

function monthTitle(date: Date): string {
	return `${getMonthName(date.getMonth())} ${date.getFullYear()}`;
}

export function calendarPeriod(anchor: Date, view: CalendarViewMode): CalendarPeriod {
	const shape = PERIODS[view];
	const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	const end = new Date(anchor.getFullYear(), anchor.getMonth() + shape.months - 1, 1);
	const title = shape.months === 1 ? monthTitle(start) : `${monthTitle(start)} – ${monthTitle(end)}`;
	return { ...shape, start, title };
}

export function shiftCalendarPeriod(anchor: Date, view: CalendarViewMode, direction: -1 | 1): Date {
	return new Date(anchor.getFullYear(), anchor.getMonth() + direction * PERIODS[view].months, 1);
}

/** The longest span one `/api/calendar-range` read accepts, in inclusive days. */
export const MAX_CALENDAR_RANGE_DAYS = 366;

/** How far before the first visible day a view reads, so each slot can see its last duty. */
export const DUTY_LOOKBACK_DAYS = 90;

/** The span a Calendar view holds: its visible months plus the duty lookback before them. */
export function calendarReadRange(anchor: Date, view: CalendarViewMode): CalendarBufferedRange {
	const firstVisible = formatDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
	const lastVisibleMonth = new Date(anchor.getFullYear(), anchor.getMonth() + PERIODS[view].months - 1, 1);
	return {
		rangeStart: fromDayNumber(toDayNumber(firstVisible) - DUTY_LOOKBACK_DAYS),
		rangeEnd: formatDate(endOfMonth(lastVisibleMonth))
	};
}

export function createInitialCalendarBufferedRange(anchorDate: Date): CalendarBufferedRange {
	return {
		rangeStart: calendarReadRange(anchorDate, 'month').rangeStart,
		rangeEnd: formatDate(endOfMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)))
	};
}

function shiftDate(dateKey: string, days: number): string {
	return fromDayNumber(toDayNumber(dateKey) + days);
}

/** The parts of `requested` that `loaded` lacks; a request that misses `loaded` entirely is its own only gap. */
export function getCalendarRangeGaps(
	loaded: CalendarBufferedRange | null,
	requested: CalendarBufferedRange
): CalendarBufferedRange[] {
	if (!loaded || requested.rangeEnd < loaded.rangeStart || requested.rangeStart > loaded.rangeEnd) {
		return [requested];
	}

	const gaps: CalendarBufferedRange[] = [];
	if (requested.rangeStart < loaded.rangeStart) {
		gaps.push({ rangeStart: requested.rangeStart, rangeEnd: shiftDate(loaded.rangeStart, -1) });
	}
	if (requested.rangeEnd > loaded.rangeEnd) {
		gaps.push({ rangeStart: shiftDate(loaded.rangeEnd, 1), rangeEnd: requested.rangeEnd });
	}
	return gaps;
}

/**
 * Coverage after a read: the union when the spans overlap or touch, otherwise the read alone,
 * so `loaded` never claims the unread days between two distant reads.
 */
export function extendLoadedRange(
	loaded: CalendarBufferedRange | null,
	read: CalendarBufferedRange
): CalendarBufferedRange {
	if (!loaded || read.rangeEnd < shiftDate(loaded.rangeStart, -1) || read.rangeStart > shiftDate(loaded.rangeEnd, 1)) {
		return { rangeStart: read.rangeStart, rangeEnd: read.rangeEnd };
	}
	return {
		rangeStart: read.rangeStart < loaded.rangeStart ? read.rangeStart : loaded.rangeStart,
		rangeEnd: read.rangeEnd > loaded.rangeEnd ? read.rangeEnd : loaded.rangeEnd
	};
}

/** Adjacent spans of at most `MAX_CALENDAR_RANGE_DAYS` inclusive days that together cover `range`. */
export function chunkCalendarReadRange(range: CalendarBufferedRange): CalendarBufferedRange[] {
	const last = toDayNumber(range.rangeEnd);
	const chunks: CalendarBufferedRange[] = [];
	for (let day: number = toDayNumber(range.rangeStart); day <= last; day += MAX_CALENDAR_RANGE_DAYS) {
		chunks.push({
			rangeStart: fromDayNumber(day),
			rangeEnd: fromDayNumber(Math.min(day + MAX_CALENDAR_RANGE_DAYS - 1, last))
		});
	}
	return chunks;
}

/** Whether a range read returns this span; it returns every span that overlaps the range. */
export function rangeCoversSpan(range: CalendarBufferedRange) {
	return (item: { startDate: string; endDate: string }) =>
		item.endDate >= range.rangeStart && item.startDate <= range.rangeEnd;
}

export function rangeCoversDate(range: CalendarBufferedRange) {
	return (item: { date: string }) => item.date >= range.rangeStart && item.date <= range.rangeEnd;
}
