import { toDayNumber } from '$lib/utils/dayNumber';
import type { DashboardPageUpdates } from '../dashboardPageUpdates';

/**
 * A mark under the forecast's day labels that opens the record it stands for. `label` names the link; a span also
 * shows its `title`. An overlay never changes the availability numbers.
 */
export type ForecastLaneMark =
	| {
			kind: 'span';
			id: string;
			start: string;
			end: string;
			title: string;
			label: string;
			href: string;
			emphasis: 'strong' | 'quiet' | 'cancelled';
	  }
	| { kind: 'point'; id: string; date: string; label: string; href: string };

export type PlacedLaneMark = ForecastLaneMark & {
	/** 1-based grid column of the first forecast day the mark covers. */
	column: number;
	span: number;
	/** 1-based row: spans pack into the fewest rows, points stack below every span. */
	row: number;
	/** Free columns after a span in its row, where a short span's title can run. */
	room: number;
};

/** A lane whose data arrives after the page: placeholder while pending, its own error with retry when failed. */
export type ForecastLaneRead =
	| { state: 'ready'; marks: readonly ForecastLaneMark[] }
	| { state: 'pending' }
	| { state: 'failed'; retry: (updates: DashboardPageUpdates) => void };

export interface ForecastLegendEntry {
	kind: ForecastLaneMark['kind'];
	label: string;
}

export interface DashboardForecastLaneView {
	id: string;
	label: string;
	/** Said in place of the marks when the lane has none. */
	empty: string;
	legend: readonly ForecastLegendEntry[];
	read: { state: 'ready'; marks: readonly PlacedLaneMark[] } | Exclude<ForecastLaneRead, { state: 'ready' }>;
}

/** Places marks on the forecast's day columns, clipping spans to the window and dropping marks outside it. */
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

	const taken: boolean[][] = [];
	const free = (row: number, column: number) => !taken[row]?.[column];
	const spans = clipped
		.filter(({ mark }) => mark.kind === 'span')
		.sort((a, b) => a.column - b.column || b.span - a.span)
		.map((placed) => {
			const columns = Array.from({ length: placed.span }, (_, offset) => placed.column + offset);
			let row = 0;
			while (!columns.every((column) => free(row, column))) row++;
			taken[row] ??= [];
			for (const column of columns) taken[row][column] = true;
			return { ...placed, row };
		});
	const spanRows = taken.length;
	const pointsOn = new Map<number, number>();

	return [
		...spans.map(({ mark, column, span, row }) => {
			let room = 0;
			while (column + span + room <= days.length && free(row, column + span + room)) room++;
			return { ...mark, column, span, row: row + 1, room };
		}),
		...clipped
			.filter(({ mark }) => mark.kind === 'point')
			.map(({ mark, column, span }) => {
				const stacked = pointsOn.get(column) ?? 0;
				pointsOn.set(column, stacked + 1);
				return { ...mark, column, span, row: spanRows + stacked + 1, room: 0 };
			})
	];
}
