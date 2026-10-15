import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { DAY_MS, type DayNumber, type DayWindow } from './dayNumber';
import { oneDayLabel } from './oneDayLabel';

export interface AvailabilitySpan {
	readonly entry: AvailabilityEntry;
	readonly status: StatusType;
	readonly start: DayNumber;
	readonly end: DayNumber;
}

export type LabelPolicy =
	| { readonly view: 'month'; readonly showStatusText: boolean }
	| { readonly view: '3-month'; readonly dayPx: number };

export type BarLabel =
	| { readonly kind: 'none' }
	| { readonly kind: 'one-day'; readonly text: string }
	| { readonly kind: 'name'; readonly text: string }
	| { readonly kind: 'name-note'; readonly name: string; readonly note: string }
	| { readonly kind: 'name-length'; readonly name: string; readonly days: number };

export type BarLane = 'full' | 'top' | 'bottom';

export interface Bar {
	readonly entry: AvailabilityEntry;
	readonly status: StatusType;
	readonly start: number;
	readonly end: number;
	readonly lane: BarLane;
	readonly continuesBefore: boolean;
	readonly continuesAfter: boolean;
	readonly label: BarLabel;
	readonly description: string;
}

export interface BarOverflow {
	readonly start: number;
	readonly end: number;
	readonly spans: readonly AvailabilitySpan[];
	readonly description: string;
}

export interface BarLayout {
	readonly bars: readonly Bar[];
	readonly overflows: readonly BarOverflow[];
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const LABEL_FONT_PX = 9;
const MONO_ADVANCE_EM = 0.6;
const GLYPH_PX = Math.ceil(LABEL_FONT_PX * MONO_ADVANCE_EM);
const PADDING_PX = 10;
const CHEVRON_PX = 8;

interface Placed {
	readonly span: AvailabilitySpan;
	readonly start: number;
	readonly end: number;
	readonly continuesBefore: boolean;
	readonly continuesAfter: boolean;
}

function civil(day: number) {
	const date = new Date(day * DAY_MS);
	return {
		day: date.getUTCDate(),
		month: date.getUTCMonth(),
		year: date.getUTCFullYear(),
		weekday: WEEKDAYS[date.getUTCDay()]
	};
}

export function spanDays(span: Pick<AvailabilitySpan, 'start' | 'end'>): number {
	return span.end - span.start + 1;
}

function dayCount(days: number): string {
	return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function longRangeLabel(startDay: number, endDay: number): string {
	const start = civil(startDay);
	const end = civil(endDay);
	const endText = `${end.day} ${MONTHS[end.month]} ${end.year}`;
	if (startDay === endDay) return endText;
	if (start.year !== end.year) return `${start.day} ${MONTHS[start.month]} ${start.year} to ${endText}`;
	if (start.month !== end.month) return `${start.day} ${MONTHS[start.month]} to ${endText}`;
	return `${start.day} to ${endText}`;
}

export function shortRangeLabel(startDay: number, endDay: number): string {
	const start = civil(startDay);
	const end = civil(endDay);
	const month = (value: number) => MONTHS[value].slice(0, 3);
	const endText = `${end.weekday} ${end.day} ${month(end.month)}`;
	if (startDay === endDay) return endText;
	const startText =
		start.month === end.month ? `${start.weekday} ${start.day}` : `${start.weekday} ${start.day} ${month(start.month)}`;
	return `${startText} – ${endText}`;
}

export function describeSpan(span: AvailabilitySpan): string {
	const note = span.entry.note?.trim();
	return [span.status.name, longRangeLabel(span.start, span.end), dayCount(spanDays(span)), note]
		.filter(Boolean)
		.join(', ');
}

function fitsCompact(chars: number, widthPx: number, chevrons: number): boolean {
	return chars * GLYPH_PX + PADDING_PX + chevrons * CHEVRON_PX <= widthPx;
}

export function barLabel(placed: Placed, policy: LabelPolicy): BarLabel {
	const { span } = placed;
	const visibleDays = placed.end - placed.start + 1;
	const name = span.status.name;
	const note = span.entry.note?.trim();

	if (policy.view === 'month') {
		if (policy.showStatusText) return note ? { kind: 'name-note', name, note } : { kind: 'name', text: name };
		if (visibleDays === 1) return { kind: 'one-day', text: oneDayLabel(span.status) };
		if (visibleDays <= 3 || !note) return { kind: 'name', text: name };
		return { kind: 'name-note', name, note };
	}

	const widthPx = visibleDays * policy.dayPx;
	const chevrons = Number(placed.continuesBefore) + Number(placed.continuesAfter);
	const days = spanDays(span);
	const fits = (chars: number) => fitsCompact(chars, widthPx, chevrons);
	if (fits([...name].length + ` · ${days}D`.length)) return { kind: 'name-length', name, days };
	if (fits([...name].length)) return { kind: 'name', text: name };
	const short = oneDayLabel(span.status);
	if (fits([...short].length)) return { kind: 'one-day', text: short };
	return { kind: 'none' };
}

function place(spans: readonly AvailabilitySpan[], window: DayWindow): Placed[] {
	const last = window.days - 1;
	const placed: Placed[] = [];
	for (const span of spans) {
		const start = span.start - window.start;
		const end = span.end - window.start;
		if (end < 0 || start > last) continue;
		placed.push({
			span,
			start: Math.max(start, 0),
			end: Math.min(end, last),
			continuesBefore: start < 0,
			continuesAfter: end > last
		});
	}
	return placed.sort(byStartThenLongest);
}

function byStartThenLongest(a: Placed, b: Placed): number {
	return (
		a.start - b.start ||
		b.span.end - a.span.end ||
		(a.span.entry.id < b.span.entry.id ? -1 : a.span.entry.id > b.span.entry.id ? 1 : 0)
	);
}

function assignLanes(cluster: readonly Placed[]): number[] {
	const laneEnds: number[] = [];
	return cluster.map((item) => {
		const lane = laneEnds.findIndex((end) => end < item.start);
		if (lane >= 0) {
			laneEnds[lane] = item.end;
			return lane;
		}
		laneEnds.push(item.end);
		return laneEnds.length - 1;
	});
}

function overflowFor(items: readonly Placed[]): BarOverflow {
	const start = Math.min(...items.map((item) => item.start));
	const end = Math.max(...items.map((item) => item.end));
	const first = Math.min(...items.map((item) => item.span.start));
	const last = Math.max(...items.map((item) => item.span.end));
	return {
		start,
		end,
		spans: items.map((item) => item.span),
		description: `${items.length} more entries, ${longRangeLabel(first, last)}`
	};
}

export function layoutBars(spans: readonly AvailabilitySpan[], window: DayWindow, policy: LabelPolicy): BarLayout {
	const placed = place(spans, window);
	const bars: Bar[] = [];
	const overflows: BarOverflow[] = [];
	const bar = (item: Placed, lane: BarLane): Bar => ({
		entry: item.span.entry,
		status: item.span.status,
		start: item.start,
		end: item.end,
		lane,
		continuesBefore: item.continuesBefore,
		continuesAfter: item.continuesAfter,
		label: barLabel(item, policy),
		description: describeSpan(item.span)
	});

	let index = 0;
	while (index < placed.length) {
		let reach = placed[index].end;
		let next = index + 1;
		while (next < placed.length && placed[next].start <= reach) {
			reach = Math.max(reach, placed[next].end);
			next++;
		}
		const cluster = placed.slice(index, next);
		index = next;

		if (cluster.length === 1) {
			bars.push(bar(cluster[0], 'full'));
			continue;
		}
		const lanes = assignLanes(cluster);
		if (Math.max(...lanes) <= 1) {
			cluster.forEach((item, at) => bars.push(bar(item, lanes[at] === 0 ? 'top' : 'bottom')));
			continue;
		}
		cluster.forEach((item, at) => {
			if (lanes[at] === 0) bars.push(bar(item, 'top'));
		});
		overflows.push(overflowFor(cluster.filter((_, at) => lanes[at] !== 0)));
	}
	return { bars, overflows };
}
