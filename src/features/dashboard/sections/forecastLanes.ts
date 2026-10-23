import { toDayNumber } from '$lib/utils/dayNumber';

/** A mark under the forecast's day labels. An overlay never changes the availability numbers. */
export type ForecastLaneMark =
	| { kind: 'span'; id: string; start: string; end: string; label: string; emphasis: 'strong' | 'quiet' }
	| { kind: 'point'; id: string; date: string; label: string };

export type PlacedLaneMark = ForecastLaneMark & {
	/** 1-based grid column of the first forecast day the mark covers. */
	column: number;
	span: number;
};

/** Places marks on the forecast's day columns, clipping spans to the window and dropping marks outside it. */
export function placeForecastLaneMarks(
	days: readonly string[],
	marks: readonly ForecastLaneMark[]
): readonly PlacedLaneMark[] {
	if (days.length === 0) return [];
	const first = toDayNumber(days[0]);
	const last = first + days.length - 1;

	return marks.flatMap((mark) => {
		const start = toDayNumber(mark.kind === 'span' ? mark.start : mark.date);
		const end = mark.kind === 'span' ? toDayNumber(mark.end) : start;
		if (end < first || start > last) return [];
		const from = Math.max(start, first);
		const to = Math.min(end, last);
		return [{ ...mark, column: from - first + 1, span: to - from + 1 }];
	});
}

export interface DashboardForecastLaneView {
	id: string;
	label: string;
	marks: readonly PlacedLaneMark[];
}
