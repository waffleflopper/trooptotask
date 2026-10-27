import { toDayNumber, type DayNumber } from '$lib/utils/dayNumber';

/** An item's days as indexes into the visible days. They may fall before 0 or past the last visible day. */
export interface IndexedSpan<T> {
	item: T;
	start: number;
	end: number;
}

export function indexSpan<T extends { startsOn: string; endsOn: string }>(
	item: T,
	firstVisible: DayNumber
): IndexedSpan<T> {
	return { item, start: toDayNumber(item.startsOn) - firstVisible, end: toDayNumber(item.endsOn) - firstVisible };
}

export interface PackedRun<T> {
	item: T;
	/** 0 is the top row. */
	row: number;
	/** Inclusive visible days that show the item. */
	start: number;
	end: number;
	/** The item also covers days before or after the visible ones. */
	continuesBefore: boolean;
	continuesAfter: boolean;
}

export interface RowPacking<T> {
	runs: PackedRun<T>[];
	/** Items no row had room for, in the order they were offered. */
	overflow: T[];
}

/**
 * Places each span, in the order given, whole on the first of `rows` rows free on all its visible days, so callers
 * order spans by priority. An item is never split; one that fits no row overflows instead of stacking a third row.
 */
export function packRows<T>(spans: readonly IndexedSpan<T>[], rows: number, days: number): RowPacking<T> {
	const placed: PackedRun<T>[][] = Array.from({ length: rows }, () => []);
	const overflow: T[] = [];
	for (const span of spans) {
		const start = Math.max(0, span.start);
		const end = Math.min(days - 1, span.end);
		if (end < start) continue;
		const row = placed.findIndex((runs) => runs.every((run) => run.end < start || run.start > end));
		if (row === -1) {
			overflow.push(span.item);
			continue;
		}
		placed[row].push({
			item: span.item,
			row,
			start,
			end,
			continuesBefore: span.start < start,
			continuesAfter: span.end > end
		});
	}
	return { runs: placed.flat().sort((a, b) => a.row - b.row || a.start - b.start), overflow };
}
