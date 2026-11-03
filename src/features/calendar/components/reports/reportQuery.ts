import { isDateOnly } from '$lib/utils/dates';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';

export const LENS_IDS = ['availability', 'time-away', 'assignment-load'] as const;
export type LensId = (typeof LENS_IDS)[number];

export const SPAN_DAYS = [14, 30, 60, 90] as const;
export type SpanDays = (typeof SPAN_DAYS)[number];

/** What the address bar holds: the lens on screen and the span it covers. `start` null means from today. */
export interface ReportQuery {
	lens: LensId;
	days: SpanDays;
	start: string | null;
}

export const DEFAULT_REPORT_QUERY: ReportQuery = { lens: 'availability', days: 30, start: null };

export function parseReportQuery(params: URLSearchParams): ReportQuery {
	const lens = LENS_IDS.find((id) => id === params.get('lens')) ?? DEFAULT_REPORT_QUERY.lens;
	const days = SPAN_DAYS.find((value) => String(value) === params.get('days')) ?? DEFAULT_REPORT_QUERY.days;
	const start = params.get('start');
	return { lens, days, start: isDateOnly(start) ? start : null };
}

/** The canonical query string, without a leading `?`; a default value is left out so the plain page stays plain. */
export function serializeReportQuery(query: ReportQuery, today: string | null): string {
	const params = new URLSearchParams();
	if (query.lens !== DEFAULT_REPORT_QUERY.lens) params.set('lens', query.lens);
	if (query.days !== DEFAULT_REPORT_QUERY.days) params.set('days', String(query.days));
	if (query.start !== null && query.start !== today) params.set('start', query.start);
	return params.toString();
}

export interface ReportRange {
	start: string;
	end: string;
}

/** `days` days from the start, inclusive of both ends; null while the viewer's today is unknown and no start is set. */
export function reportRange(query: ReportQuery, today: string | null): ReportRange | null {
	const start = query.start ?? today;
	if (start === null) return null;
	return { start, end: fromDayNumber(toDayNumber(start) + query.days - 1) };
}

/** Moves the span one span-length earlier or later. */
export function shiftReportStart(range: ReportRange, days: SpanDays, direction: -1 | 1): string {
	return fromDayNumber(toDayNumber(range.start) + direction * days);
}
