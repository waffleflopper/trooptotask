import { endOfMonth, formatDate, getMonthName } from '$lib/utils/dates';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';

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

/** How far before the first visible day a view reads assignments, so each slot can see its last duty. */
export const DUTY_LOOKBACK_DAYS = 90;

/** The collections one range read returns; Special Days travel with assignments. */
export const CALENDAR_RANGE_COLLECTIONS = ['availability', 'assignments'] as const;

export type CalendarRangeCollection = (typeof CALENDAR_RANGE_COLLECTIONS)[number];

/** The days of each collection that a view needs or a coordinator holds. */
export type CalendarCoverage = Partial<Record<CalendarRangeCollection, CalendarBufferedRange>>;

/** One `/api/calendar-range` read: the collections it returns over one span. */
export interface CalendarRangeRequest extends CalendarBufferedRange {
	collections: CalendarRangeCollection[];
}

function coverageThrough(firstVisible: string, lastVisible: string, today: string): Required<CalendarCoverage> {
	const lookbackStart = shiftDate(firstVisible, -DUTY_LOOKBACK_DAYS);
	// The title row counts today's availability; reading back to today inside the lookback keeps that count.
	const availabilityStart = today >= lookbackStart && today < firstVisible ? today : firstVisible;
	return {
		availability: { rangeStart: availabilityStart, rangeEnd: lastVisible },
		assignments: { rangeStart: lookbackStart, rangeEnd: lastVisible }
	};
}

/** What a Calendar view needs: availability over its visible months, assignments from the duty lookback before them. */
export function calendarViewCoverage(
	anchor: Date,
	view: CalendarViewMode,
	today: string = formatDate(new Date())
): Required<CalendarCoverage> {
	const lastVisibleMonth = new Date(anchor.getFullYear(), anchor.getMonth() + PERIODS[view].months - 1, 1);
	return coverageThrough(
		formatDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
		formatDate(endOfMonth(lastVisibleMonth)),
		today
	);
}

/** The bootstrap holds the anchor month's view and the month after it, so Next month needs no read. */
export function initialCalendarCoverage(anchor: Date, today: string): Required<CalendarCoverage> {
	return coverageThrough(
		formatDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
		formatDate(endOfMonth(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))),
		today
	);
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

/**
 * The reads that bring `loaded` up to `needed`: each collection's missing days, in spans of at most
 * `MAX_CALENDAR_RANGE_DAYS`, with collections that miss the same span sharing one read.
 */
export function planCalendarRangeReads(loaded: CalendarCoverage, needed: CalendarCoverage): CalendarRangeRequest[] {
	const reads = new Map<string, CalendarRangeRequest>();
	for (const collection of CALENDAR_RANGE_COLLECTIONS) {
		const range = needed[collection];
		if (!range) continue;
		for (const gap of getCalendarRangeGaps(loaded[collection] ?? null, range).flatMap(chunkCalendarReadRange)) {
			const key = `${gap.rangeStart}:${gap.rangeEnd}`;
			const read = reads.get(key) ?? { ...gap, collections: [] };
			read.collections.push(collection);
			reads.set(key, read);
		}
	}
	return [...reads.values()];
}

/** Whether a range read returns this span; it returns every span that overlaps the range. */
export function rangeCoversSpan(range: CalendarBufferedRange) {
	return (item: { startDate: string; endDate: string }) =>
		item.endDate >= range.rangeStart && item.startDate <= range.rangeEnd;
}

export function rangeCoversDate(range: CalendarBufferedRange) {
	return (item: { date: string }) => item.date >= range.rangeStart && item.date <= range.rangeEnd;
}
