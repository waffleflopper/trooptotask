import { endOfMonth, formatDate, parseDate, startOfMonth } from '$lib/utils/dates';

export interface CalendarBufferedRange {
	rangeStart: string;
	rangeEnd: string;
}

export type CalendarViewMode = 'month' | '3-month';

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
