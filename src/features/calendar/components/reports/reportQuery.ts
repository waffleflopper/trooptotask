import { isDateOnly } from '$lib/utils/dates';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';

export const LENS_IDS = ['availability', 'time-away', 'assignment-load'] as const;
export type LensId = (typeof LENS_IDS)[number];

export const SPAN_DAYS = [14, 30, 60, 90] as const;
export type SpanDays = (typeof SPAN_DAYS)[number];

/** Whether a lens looks ahead from today or back over the days that have passed. */
export type SpanDirection = 'ahead' | 'back';

/** How a lens reads time: `ahead` spans open on today, `back` spans close on yesterday. */
export interface LensSpan {
	direction: SpanDirection;
	defaultDays: SpanDays;
}

/** The span of a lens, as the lens registry declares it. */
export type SpanOf = (lens: LensId) => LensSpan;

/** What the address bar holds: the lens on screen and the span it covers. `start` null means the lens's current span. */
export interface ReportQuery {
	lens: LensId;
	days: SpanDays;
	start: string | null;
}

const DEFAULT_LENS: LensId = LENS_IDS[0];

export function parseReportQuery(params: Pick<URLSearchParams, 'get'>, spanOf: SpanOf): ReportQuery {
	const lens = LENS_IDS.find((id) => id === params.get('lens')) ?? DEFAULT_LENS;
	const days = SPAN_DAYS.find((value) => String(value) === params.get('days')) ?? spanOf(lens).defaultDays;
	const start = params.get('start');
	return { lens, days, start: isDateOnly(start) ? start : null };
}

/** The first day of the span that has no `start` in the address: today ahead, `days` before today back. */
function currentSpanStart(span: LensSpan, days: SpanDays, today: string | null): string | null {
	if (today === null) return null;
	return span.direction === 'ahead' ? today : fromDayNumber(toDayNumber(today) - days);
}

/** The canonical query string, without a leading `?`; a default value is left out so the plain page stays plain. */
export function serializeReportQuery(query: ReportQuery, today: string | null, span: LensSpan): string {
	const params = new URLSearchParams();
	if (query.lens !== DEFAULT_LENS) params.set('lens', query.lens);
	if (query.days !== span.defaultDays) params.set('days', String(query.days));
	if (query.start !== null && query.start !== currentSpanStart(span, query.days, today)) {
		params.set('start', query.start);
	}
	return params.toString();
}

/**
 * The address for `target`. A lens that reads time the other way gets its own default span, because a start that
 * means "from here on" is not a start that means "up to here".
 */
export function switchLens(query: ReportQuery, target: LensId, spanOf: SpanOf): ReportQuery {
	const to = spanOf(target);
	return spanOf(query.lens).direction === to.direction
		? { ...query, lens: target }
		: { lens: target, days: to.defaultDays, start: null };
}

export interface ReportRange {
	start: string;
	end: string;
}

/** `days` days from the start, inclusive of both ends; null while the viewer's today is unknown and no start is set. */
export function reportRange(query: ReportQuery, today: string | null, span: LensSpan): ReportRange | null {
	const start = query.start ?? currentSpanStart(span, query.days, today);
	if (start === null) return null;
	return { start, end: fromDayNumber(toDayNumber(start) + query.days - 1) };
}

/** The range extended by `days` days after its end. */
export function extendRange(range: ReportRange, days: number): ReportRange {
	return { start: range.start, end: fromDayNumber(toDayNumber(range.end) + days) };
}

/**
 * The start of the span one span-length earlier or later, or null when there is no such span. A back lens has no
 * later span once it closes on yesterday, and a later move from an older span stops at the current one.
 */
export function shiftReportStart(
	range: ReportRange,
	days: SpanDays,
	direction: -1 | 1,
	span: LensSpan,
	today: string | null
): string | null {
	const shifted = fromDayNumber(toDayNumber(range.start) + direction * days);
	if (direction === -1 || span.direction === 'ahead') return shifted;
	const current = currentSpanStart(span, days, today);
	if (current === null || range.start >= current) return null;
	return shifted < current ? shifted : current;
}

/** Whether `query` names a span other than the lens's current one, so the page can offer a way back to it. */
export function isOffCurrentSpan(query: ReportQuery, today: string | null, span: LensSpan): boolean {
	return query.start !== null && query.start !== currentSpanStart(span, query.days, today);
}

/** The button text that returns to the current span. */
export function currentSpanLabel(span: LensSpan): string {
	return span.direction === 'ahead' ? 'Today' : 'Latest';
}
