import { endOfMonth, formatDate, getMonthName, parseDate, startOfMonth } from '$lib/utils/dates';

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

export function createInitialCalendarBufferedRange(anchorDate: Date): CalendarBufferedRange {
	return {
		rangeStart: formatDate(startOfMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1))),
		rangeEnd: formatDate(endOfMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)))
	};
}

export function createVisibleCalendarRange(anchorDate: Date, viewMode: CalendarViewMode): CalendarBufferedRange {
	return {
		rangeStart: formatDate(startOfMonth(anchorDate)),
		rangeEnd: formatDate(
			endOfMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + (viewMode === '3-month' ? 2 : 0), 1))
		)
	};
}

function shiftDate(dateString: string, days: number): string {
	const nextDate = parseDate(dateString);
	nextDate.setDate(nextDate.getDate() + days);
	return formatDate(nextDate);
}

export function getCalendarRangeGaps(
	bufferedRange: CalendarBufferedRange | null,
	visibleRange: CalendarBufferedRange
): CalendarBufferedRange[] {
	if (!bufferedRange) {
		return [visibleRange];
	}

	if (visibleRange.rangeStart >= bufferedRange.rangeStart && visibleRange.rangeEnd <= bufferedRange.rangeEnd) {
		return [];
	}

	const gaps: CalendarBufferedRange[] = [];

	if (visibleRange.rangeStart < bufferedRange.rangeStart) {
		gaps.push({
			rangeStart: visibleRange.rangeStart,
			rangeEnd: shiftDate(bufferedRange.rangeStart, -1)
		});
	}

	if (visibleRange.rangeEnd > bufferedRange.rangeEnd) {
		gaps.push({
			rangeStart: shiftDate(bufferedRange.rangeEnd, 1),
			rangeEnd: visibleRange.rangeEnd
		});
	}

	return gaps;
}

/** Whether a range read returns this span; it returns every span that overlaps the range. */
export function rangeCoversSpan(range: CalendarBufferedRange) {
	return (item: { startDate: string; endDate: string }) =>
		item.endDate >= range.rangeStart && item.startDate <= range.rangeEnd;
}

export function rangeCoversDate(range: CalendarBufferedRange) {
	return (item: { date: string }) => item.date >= range.rangeStart && item.date <= range.rangeEnd;
}
