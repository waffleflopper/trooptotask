import { toDayNumber } from '$lib/utils/dayNumber';
import type { DashboardPageUpdates } from '../dashboardPageUpdates';

/**
 * A mark under the forecast's day labels that opens the record it stands for. `label` names the link; `title` and
 * `detail` show when the mark is listed with others. An overlay never changes the availability numbers.
 */
export type ForecastLaneMark = { id: string; title: string; detail: string; label: string; href: string } & (
	| { kind: 'span'; start: string; end: string; emphasis: 'strong' | 'quiet' | 'cancelled' }
	| { kind: 'point'; date: string }
);

export type PlacedLaneMark = ForecastLaneMark & {
	/** 1-based grid column of the first forecast day the mark covers. */
	column: number;
	span: number;
	/** 1-based row: spans take the first SPAN_ROWS, points the row below. */
	row: number;
	/** Free columns after a span in its row, where a short span's title can run. */
	room: number;
	/** Marks with no row of their own on these days, listed with this one. */
	more: readonly ForecastLaneMark[];
};

/** A lane whose data arrives after the page: placeholder while pending, its own error with retry when failed. */
export type ForecastLaneRead =
	| { state: 'ready'; marks: readonly ForecastLaneMark[] }
	| { state: 'pending' }
	| { state: 'failed'; retry: (updates: DashboardPageUpdates) => void };

export interface ForecastLegendEntry {
	kind: ForecastLaneMark['kind'];
	label: string;
	plural: string;
}

export interface DashboardForecastLaneView {
	id: string;
	label: string;
	/** Said in place of the marks when the lane has none. */
	empty: string;
	legend: readonly ForecastLegendEntry[];
	read: { state: 'ready'; marks: readonly PlacedLaneMark[] } | Exclude<ForecastLaneRead, { state: 'ready' }>;
}

/** A lane is always this many span rows and one point row, so its height never changes when data arrives. */
export const SPAN_ROWS = 2;
export const LANE_ROWS = SPAN_ROWS + 1;

/**
 * Places marks on the forecast's day columns, clipping spans to the window and dropping marks outside it. A span with
 * no free row is listed with the bottom-row span it overlaps, and a day's later points with its first.
 */
export function placeForecastLaneMarks(
	days: readonly string[],
	marks: readonly ForecastLaneMark[]
): readonly PlacedLaneMark[] {
	if (days.length === 0) return [];
	const first = toDayNumber(days[0]);
	const last = first + days.length - 1;

	const clipped = marks.flatMap((mark) => {
		const start = toDayNumber(mark.kind === 'span' ? mark.start : mark.date);
		const end = mark.kind === 'span' ? toDayNumber(mark.end) : start;
		if (end < first || start > last) return [];
		const from = Math.max(start, first);
		return [{ mark, column: from - first + 1, span: Math.min(end, last) - from + 1 }];
	});

	type Placed = { mark: ForecastLaneMark; column: number; span: number; row: number; more: ForecastLaneMark[] };
	const rows: (Placed | undefined)[][] = Array.from({ length: SPAN_ROWS }, () => []);
	const spans: Placed[] = [];
	for (const { mark, column, span } of clipped
		.filter(({ mark }) => mark.kind === 'span')
		.sort((a, b) => a.column - b.column || b.span - a.span)) {
		const columns = Array.from({ length: span }, (_, offset) => column + offset);
		const row = rows.findIndex((cells) => columns.every((cell) => !cells[cell]));
		if (row < 0) {
			columns
				.map((cell) => rows[SPAN_ROWS - 1][cell])
				.find((host) => host)
				?.more.push(mark);
			continue;
		}
		const placed = { mark, column, span, row, more: [] };
		for (const cell of columns) rows[row][cell] = placed;
		spans.push(placed);
	}

	const points = new Map<number, Placed>();
	for (const { mark, column, span } of clipped.filter(({ mark }) => mark.kind === 'point')) {
		const host = points.get(column);
		if (host) host.more.push(mark);
		else points.set(column, { mark, column, span, row: SPAN_ROWS, more: [] });
	}

	return [...spans, ...points.values()].map(({ mark, column, span, row, more }) => {
		let room = 0;
		if (mark.kind === 'span') {
			while (column + span + room <= days.length && !rows[row][column + span + room]) room++;
		}
		return { ...mark, column, span, row: row + 1, room, more };
	});
}
