import { CalendarDate, toZoned } from '@internationalized/date';
import { isDateOnly, isTimeZone } from '$lib/utils/dates';
import { isActivityCategory, type ActivityCategory, type AuditEventRecord } from './auditSentences';

export const ACTIVITY_PAGE_SIZE = 50;
const SEARCH_MAX_LENGTH = 100;

export interface ActivityQuery {
	category: ActivityCategory | null;
	q: string;
	/** Inclusive "YYYY-MM-DD" days in the viewer's time zone; empty means unbounded. */
	from: string;
	to: string;
	page: number;
}

export interface ActivityPage {
	events: AuditEventRecord[];
	page: number;
	pageSize: number;
	totalCount: number;
	/** The signed-in operator, so their own actions read "You". */
	viewerId: string;
}

/** Reads the filter state from a URL. Anything unrecognized falls back to its default instead of failing. */
export function parseActivityQuery(params: URLSearchParams): ActivityQuery {
	const category = params.get('category');
	const from = params.get('from') ?? '';
	const to = params.get('to') ?? '';
	const page = Number(params.get('page'));
	return {
		category: isActivityCategory(category) ? category : null,
		q: (params.get('q') ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
		from: isDateOnly(from) ? from : '',
		to: isDateOnly(to) ? to : '',
		page: Number.isInteger(page) && page > 0 ? page : 1
	};
}

/** The URL query string for a state; defaults are left out so a clean Activity URL stays clean. */
export function activitySearchParams(query: ActivityQuery): URLSearchParams {
	const params = new URLSearchParams();
	if (query.category) params.set('category', query.category);
	if (query.q) params.set('q', query.q);
	if (query.from) params.set('from', query.from);
	if (query.to) params.set('to', query.to);
	if (query.page > 1) params.set('page', String(query.page));
	return params;
}

export const DEFAULT_ACTIVITY_TIME_ZONE = 'UTC';

export function activityTimeZone(value: string | null | undefined): string {
	return isTimeZone(value) ? value : DEFAULT_ACTIVITY_TIME_ZONE;
}

function startOfDay(day: string, timeZone: string): Date {
	const [year, month, date] = day.split('-').map(Number);
	return toZoned(new CalendarDate(year, month, date), timeZone, 'compatible').toDate();
}

/** The half-open instant range for the chosen days: the first day's start to the day after the last day's start. */
export function activityInstantRange(
	query: Pick<ActivityQuery, 'from' | 'to'>,
	timeZone: string
): { from: Date | null; to: Date | null } {
	const [start, end] =
		query.from && query.to && query.from > query.to ? [query.to, query.from] : [query.from, query.to];
	const dayAfter = (day: string) => {
		const [year, month, date] = day.split('-').map(Number);
		const next = new CalendarDate(year, month, date).add({ days: 1 });
		return startOfDay(next.toString(), timeZone);
	};
	return { from: start ? startOfDay(start, timeZone) : null, to: end ? dayAfter(end) : null };
}

/** The "YYYY-MM-DD" day an instant falls on in `timeZone`, the key Activity groups by. */
export function activityDayKey(timestamp: string, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date(timestamp));
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}`;
}

export interface ActivityDay {
	day: string;
	events: AuditEventRecord[];
}

/** Newest first in, newest first out: events keep their order inside each day. */
export function groupActivityByDay(events: readonly AuditEventRecord[], timeZone: string): ActivityDay[] {
	const days: ActivityDay[] = [];
	for (const event of events) {
		const day = activityDayKey(event.timestamp, timeZone);
		const last = days.at(-1);
		if (last?.day === day) last.events.push(event);
		else days.push({ day, events: [event] });
	}
	return days;
}

export interface ActivityRangePreset {
	id: string;
	label: string;
	getRange: () => { start: string; end: string };
}

/** Today and the trailing 7 and 30 days, counted in `timeZone` from the supplied instant. */
export function activityRangePresets(timeZone: string, now: Date): ActivityRangePreset[] {
	const [year, month, day] = activityDayKey(now.toISOString(), timeZone).split('-').map(Number);
	const today = new CalendarDate(year, month, day);
	const trailing = (id: string, label: string, days: number): ActivityRangePreset => ({
		id,
		label,
		getRange: () => ({ start: today.subtract({ days: days - 1 }).toString(), end: today.toString() })
	});
	return [trailing('today', 'Today', 1), trailing('last-7', 'Last 7 days', 7), trailing('last-30', 'Last 30 days', 30)];
}

const monthDayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthDayYearFormat = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	timeZone: 'UTC'
});

/** "Oct 21", with the year when the day is not in the same year as `today`. Both are "YYYY-MM-DD". */
function shortDay(day: string, today: string): string {
	const format = day.slice(0, 4) === today.slice(0, 4) ? monthDayFormat : monthDayYearFormat;
	return format.format(new Date(`${day}T12:00:00Z`));
}

/** "Today · Oct 23", "Yesterday · Oct 22", then "Oct 21". `day` and `today` are "YYYY-MM-DD" in the viewer's zone. */
export function activityDayHeading(day: string, today: string): string {
	const [year, month, date] = today.split('-').map(Number);
	const yesterday = new CalendarDate(year, month, date).subtract({ days: 1 }).toString();
	const label = shortDay(day, today);
	if (day === today) return `Today · ${label}`;
	if (day === yesterday) return `Yesterday · ${label}`;
	return label;
}

/** What the range control says: "All time", a preset's name when the days match one, else the days themselves. */
export function activityRangeLabel(
	range: Pick<ActivityQuery, 'from' | 'to'>,
	presets: readonly ActivityRangePreset[],
	today: string
): string {
	if (!range.from && !range.to) return 'All time';
	const preset = presets.find((candidate) => {
		const { start, end } = candidate.getRange();
		return start === range.from && end === range.to;
	});
	if (preset) return preset.label;
	if (range.from && range.to) return `${shortDay(range.from, today)} – ${shortDay(range.to, today)}`;
	return range.from ? `Since ${shortDay(range.from, today)}` : `Until ${shortDay(range.to, today)}`;
}
