import {
	addMonths,
	endOfMonth,
	formatDate,
	formatDayMonth,
	formatDayMonthYear,
	getMonthDates,
	getMonthName,
	parseDate
} from '$lib/utils/dates';
import { fromDayNumber, mondayOf, toDayNumber } from '$lib/utils/dayNumber';

export interface CalendarBufferedRange {
	rangeStart: string;
	rangeEnd: string;
}

export type CalendarViewMode = 'agenda' | 'week' | 'month' | '3-month';

/** Below this width a month grid needs sideways scrolling, so the Calendar opens on Agenda; matches Tailwind's `max-[640px]`. */
export const PHONE_WIDTH_QUERY = '(width < 641px)';

/** The view a Calendar opens on. Only the opening view depends on width; the view is never switched on resize. */
export function initialCalendarView(): CalendarViewMode {
	return typeof window !== 'undefined' && window.matchMedia?.(PHONE_WIDTH_QUERY).matches ? 'agenda' : 'month';
}

/** What a view shows from its anchor: one Monday-start week, or whole months from the anchor's month. */
type PeriodSpan = { readonly unit: 'week' } | { readonly unit: 'months'; readonly count: number };

export interface CalendarPeriod {
	readonly start: Date;
	readonly title: string;
	readonly previousLabel: string;
	readonly nextLabel: string;
}

const WEEK: PeriodSpan = { unit: 'week' };

const PERIODS: Record<
	CalendarViewMode,
	{ readonly span: PeriodSpan } & Pick<CalendarPeriod, 'previousLabel' | 'nextLabel'>
> = {
	agenda: { span: WEEK, previousLabel: 'Previous week', nextLabel: 'Next week' },
	week: { span: WEEK, previousLabel: 'Previous week', nextLabel: 'Next week' },
	month: { span: { unit: 'months', count: 1 }, previousLabel: 'Previous month', nextLabel: 'Next month' },
	'3-month': { span: { unit: 'months', count: 3 }, previousLabel: 'Previous 3 months', nextLabel: 'Next 3 months' }
};

function monthTitle(date: Date): string {
	return `${getMonthName(date.getMonth())} ${date.getFullYear()}`;
}

/** "9–15 Nov 2026", "27 Oct – 2 Nov 2026" or "28 Dec 2026 – 3 Jan 2027". */
function weekTitle(mondayKey: string, sundayKey: string): string {
	if (mondayKey.slice(0, 7) === sundayKey.slice(0, 7)) {
		return `${Number(mondayKey.slice(8))}–${formatDayMonthYear(sundayKey)}`;
	}
	if (mondayKey.slice(0, 4) === sundayKey.slice(0, 4)) {
		return `${formatDayMonth(mondayKey)} – ${formatDayMonthYear(sundayKey)}`;
	}
	return `${formatDayMonthYear(mondayKey)} – ${formatDayMonthYear(sundayKey)}`;
}

/** The first and last day a view shows from `anchor`. */
function visibleDays(anchor: Date, view: CalendarViewMode): { first: Date; last: Date } {
	const { span } = PERIODS[view];
	if (span.unit === 'week') {
		const [first] = weekDates(anchor);
		return { first, last: new Date(first.getFullYear(), first.getMonth(), first.getDate() + 6) };
	}
	return {
		first: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
		last: endOfMonth(new Date(anchor.getFullYear(), anchor.getMonth() + span.count - 1, 1))
	};
}

export function calendarPeriod(anchor: Date, view: CalendarViewMode): CalendarPeriod {
	const { span, ...labels } = PERIODS[view];
	const { first, last } = visibleDays(anchor, view);
	if (span.unit === 'week') return { ...labels, start: first, title: weekTitle(formatDate(first), formatDate(last)) };
	const title = span.count === 1 ? monthTitle(first) : `${monthTitle(first)} – ${monthTitle(last)}`;
	return { ...labels, start: first, title };
}

export function shiftCalendarPeriod(anchor: Date, view: CalendarViewMode, direction: -1 | 1): Date {
	const { span } = PERIODS[view];
	if (span.unit === 'week') {
		return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + direction * 7);
	}
	return new Date(anchor.getFullYear(), anchor.getMonth() + direction * span.count, 1);
}

/** The seven days of the Monday-start week `anchor` falls in. */
export function weekDates(anchor: Date): Date[] {
	const monday = parseDate(mondayOf(formatDate(anchor)));
	return Array.from(
		{ length: 7 },
		(_, offset) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset)
	);
}

/** The longest span one `/api/calendar-range` or `/api/calendar-reports/status-days` read accepts, in inclusive days. */
export const MAX_CALENDAR_RANGE_DAYS = 366;

/** A view starting up to this many days after today also reads availability back to today, for the title row's count. */
const TODAY_READ_BACK_DAYS = 90;

/** The collections one range read returns; Special Days travel with assignments. */
export const CALENDAR_RANGE_COLLECTIONS = ['availability', 'assignments', 'events'] as const;

export type CalendarRangeCollection = (typeof CALENDAR_RANGE_COLLECTIONS)[number];

/** What a read without `collections` returns: a tab loaded before `events` existed never asks for it. */
export const DEFAULT_CALENDAR_RANGE_COLLECTIONS = ['availability', 'assignments'] as const;

/** The collections every Calendar view needs; `events` joins them only behind the Events & Taskings switch. */
type BaseCoverage = Required<Pick<CalendarCoverage, (typeof DEFAULT_CALENDAR_RANGE_COLLECTIONS)[number]>>;

/** The days of each collection that a view needs or a coordinator holds. */
export type CalendarCoverage = Partial<Record<CalendarRangeCollection, CalendarBufferedRange>>;

/** One `/api/calendar-range` read: the collections it returns over one span. */
export interface CalendarRangeRequest extends CalendarBufferedRange {
	collections: CalendarRangeCollection[];
}

function coverageThrough(firstVisible: string, lastVisible: string, today: string): BaseCoverage {
	const readBackStart = shiftDate(firstVisible, -TODAY_READ_BACK_DAYS);
	const availabilityStart = today >= readBackStart && today < firstVisible ? today : firstVisible;
	return {
		availability: { rangeStart: availabilityStart, rangeEnd: lastVisible },
		assignments: { rangeStart: firstVisible, rangeEnd: lastVisible }
	};
}

/** What a Calendar view needs: availability and assignments over its visible days. */
export function calendarViewCoverage(
	anchor: Date,
	view: CalendarViewMode,
	today: string = formatDate(new Date())
): BaseCoverage {
	const { first, last } = visibleDays(anchor, view);
	return coverageThrough(formatDate(first), formatDate(last), today);
}

/** Every day of the three months a 3-Month view shows, from the anchor's month. */
export function longRangeDates(anchor: Date): Date[] {
	const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	return [0, 1, 2].flatMap((offset) => {
		const month = addMonths(first, offset);
		return getMonthDates(month.getFullYear(), month.getMonth());
	});
}

/**
 * The bootstrap holds the anchor month's view and the month after it, so Next month needs no read.
 * The server knows only its UTC day, and every viewer's day is within one day of it, so availability
 * starts at the earliest of those days within the read-back and covers each viewer's today.
 */
export function initialCalendarCoverage(anchor: Date, serverToday: string): BaseCoverage {
	const firstVisible = formatDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
	const readBackStart = shiftDate(firstVisible, -TODAY_READ_BACK_DAYS);
	const viewerDays = [-1, 0, 1].map((days) => shiftDate(serverToday, days));
	return coverageThrough(
		firstVisible,
		formatDate(endOfMonth(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))),
		viewerDays.find((day) => day >= readBackStart) ?? firstVisible
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
