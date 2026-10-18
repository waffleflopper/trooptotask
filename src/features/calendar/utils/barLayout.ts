import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { DAY_MS, type DayNumber, type DayWindow } from './dayNumber';
import { oneDayLabel } from './oneDayLabel';

export interface AvailabilitySpan {
	readonly entry: AvailabilityEntry;
	readonly status: StatusType;
	readonly start: DayNumber;
	readonly end: DayNumber;
}

/** Whether `text` fits a bar `width` wide that also draws `chevrons` continuation marks. */
export type LabelFit = (text: string, width: number, chevrons: number) => boolean;

export type LabelPolicy =
	| { readonly view: 'month'; readonly showStatusText: boolean }
	| { readonly view: '3-month'; readonly dayPx: number }
	| { readonly view: 'print'; readonly dayWidth: number; readonly fits: LabelFit };

export type BarLabel =
	| { readonly kind: 'none' }
	| { readonly kind: 'one-day'; readonly text: string }
	| { readonly kind: 'name'; readonly text: string }
	| { readonly kind: 'name-note'; readonly name: string; readonly note: string }
	| { readonly kind: 'with-length'; readonly text: string; readonly days: number };

export type BarLane = 'full' | 'top' | 'bottom';

/** A drawn part of a lower bar or summary that marker days cut. */
export interface TrackPiece {
	readonly start: number;
	readonly end: number;
	/** Stops a quarter of the way into `end`, leaving the rest of that day to its marker. */
	readonly yieldsEnd: boolean;
}

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
	/** Set by `fitMarkers` when marker days cut the bar; absent when it is drawn whole. */
	readonly pieces?: readonly TrackPiece[];
}

export interface BarOverflow {
	readonly start: number;
	readonly end: number;
	readonly spans: readonly AvailabilitySpan[];
	readonly description: string;
	readonly pieces?: readonly TrackPiece[];
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

function fitsCompact(text: string, widthPx: number, chevrons: number): boolean {
	return [...text].length * GLYPH_PX + PADDING_PX + chevrons * CHEVRON_PX <= widthPx;
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

	const [fitsWidth, dayWidth] = policy.view === 'print' ? [policy.fits, policy.dayWidth] : [fitsCompact, policy.dayPx];
	const width = visibleDays * dayWidth;
	const chevrons = Number(placed.continuesBefore) + Number(placed.continuesAfter);
	const days = spanDays(span);
	const fits = (text: string, suffix = '') => fitsWidth(text + suffix, width, chevrons);
	const length = ` · ${days}D`;
	if (fits(name, length)) return { kind: 'with-length', text: name, days };
	const short = oneDayLabel(span.status);
	if (fits(short, length)) return { kind: 'with-length', text: short, days };
	if (fits(short)) return { kind: 'one-day', text: short };
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

	for (const cluster of overlapGroups(placed)) {
		if (cluster.length === 1) {
			bars.push(bar(cluster[0], 'full'));
			continue;
		}
		const assigned = assignLanes(cluster);
		const lanes = new Map(cluster.map((item, at) => [item, assigned[at]] as const));
		const lower = cluster.filter((item) => lanes.get(item)! > 0);
		for (const item of cluster) if (lanes.get(item) === 0) bars.push(bar(item, 'top'));
		// Only a run of lower entries that needs a third lane folds; the rest of the bottom lane stays bars.
		for (const run of overlapGroups(lower)) {
			if (run.some((item) => lanes.get(item)! > 1)) overflows.push(overflowFor(run));
			else bars.push(...run.map((item) => bar(item, 'bottom')));
		}
	}
	return { bars, overflows };
}

/** Splits start-sorted items into runs that share a day, directly or through each other. */
function overlapGroups(items: readonly Placed[]): Placed[][] {
	const groups: Placed[][] = [];
	let reach = -Infinity;
	for (const item of items) {
		if (item.start > reach) groups.push([]);
		groups[groups.length - 1].push(item);
		reach = Math.max(reach, item.end);
	}
	return groups;
}

export interface MarkedDay {
	readonly day: number;
	/** A lower bar or summary keeps the first quarter of this day's bottom lane. */
	readonly shared: boolean;
}

export interface MarkerFit {
	readonly layout: BarLayout;
	readonly markers: readonly MarkedDay[];
}

/**
 * A duty marker takes the bottom lane of its day, so every marker and every entry keeps a target of its own.
 * A full-height bar across it drops to the top lane. A lower bar or summary already in that lane keeps the
 * first quarter of the day and resumes on the next, because a fixed-height row has no third lane to move to.
 */
export function fitMarkers(layout: BarLayout, markerDays: readonly number[]): MarkerFit {
	if (markerDays.length === 0) return { layout, markers: [] };
	const days = [...markerDays].sort((a, b) => a - b);
	const within = (item: { start: number; end: number }) => days.filter((day) => day >= item.start && day <= item.end);
	const shared = new Set<number>();
	const cut = <T extends Bar | BarOverflow>(item: T): T => {
		const cuts = within(item);
		if (cuts.length === 0) return item;
		const pieces: TrackPiece[] = [];
		let start = item.start;
		for (const day of cuts) {
			shared.add(day);
			pieces.push({ start, end: day, yieldsEnd: true });
			start = day + 1;
		}
		if (start <= item.end) pieces.push({ start, end: item.end, yieldsEnd: false });
		return { ...item, pieces };
	};
	const bars = layout.bars.map((bar): Bar => {
		if (bar.lane === 'bottom') return cut(bar);
		return bar.lane === 'full' && within(bar).length > 0 ? { ...bar, lane: 'top' } : bar;
	});
	const overflows = layout.overflows.map(cut);
	return { layout: { bars, overflows }, markers: days.map((day) => ({ day, shared: shared.has(day) })) };
}
