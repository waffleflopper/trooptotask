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

export interface RowRun<T> {
	item: T;
	/** Inclusive visible days that show the item. */
	start: number;
	end: number;
	/** The item also covers days before or after this run, whether off screen or behind another item. */
	continuesBefore: boolean;
	continuesAfter: boolean;
}

/** Consecutive days that hide the same items behind the visible one. */
export interface RowOverflow<T> {
	start: number;
	end: number;
	hidden: T[];
}

export interface RowLayout<T> {
	runs: RowRun<T>[];
	overflows: RowOverflow<T>[];
}

/**
 * One row shows one item per day: the first of `spans` that covers it, so callers order spans by priority.
 * Every item covering a day beyond the first is counted in an overflow instead of shrinking the row or
 * stacking labels. An item is visible on one unbroken run, because an earlier item that covers a day it
 * hides must also have covered every day before it.
 */
export function layoutSingleRow<T>(
	spans: readonly IndexedSpan<T>[],
	days: number,
	idOf: (item: T) => string
): RowLayout<T> {
	const runs: RowRun<T>[] = [];
	const overflows: RowOverflow<T>[] = [];
	const open: {
		run: { span: IndexedSpan<T>; start: number } | null;
		overflow: { key: string; start: number; hidden: T[] } | null;
	} = { run: null, overflow: null };

	for (let day = 0; day < days; day++) {
		const covering = spans.filter((span) => span.start <= day && day <= span.end);
		const visible = covering[0];
		if (open.run && open.run.span !== visible) {
			runs.push(finishRun(open.run, day - 1));
			open.run = null;
		}
		if (visible && !open.run) open.run = { span: visible, start: day };

		const hidden = covering.slice(1).map((span) => span.item);
		const key = hidden.map(idOf).join(',');
		if (open.overflow && open.overflow.key !== key) {
			overflows.push({ start: open.overflow.start, end: day - 1, hidden: open.overflow.hidden });
			open.overflow = null;
		}
		if (hidden.length > 0 && !open.overflow) open.overflow = { key, start: day, hidden };
	}
	if (open.run) runs.push(finishRun(open.run, days - 1));
	if (open.overflow) overflows.push({ start: open.overflow.start, end: days - 1, hidden: open.overflow.hidden });
	return { runs, overflows };
}

function finishRun<T>(run: { span: IndexedSpan<T>; start: number }, end: number): RowRun<T> {
	return {
		item: run.span.item,
		start: run.start,
		end,
		continuesBefore: run.span.start < run.start,
		continuesAfter: run.span.end > end
	};
}

/** Every item an earlier one hides on the days of `run`, once each, in the order the overflows list them. */
export function hiddenBehind<T>(
	run: { start: number; end: number },
	overflows: readonly RowOverflow<T>[],
	idOf: (item: T) => string
): T[] {
	const hidden = new Map<string, T>();
	for (const overflow of overflows) {
		if (overflow.start > run.end || overflow.end < run.start) continue;
		for (const item of overflow.hidden) hidden.set(idOf(item), item);
	}
	return [...hidden.values()];
}
