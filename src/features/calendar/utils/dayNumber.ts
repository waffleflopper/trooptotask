/** Whole days since 1970-01-01 in UTC, so day arithmetic never crosses a daylight-saving edge. */
export type DayNumber = number & { readonly __brand: 'DayNumber' };

export const DAY_MS = 86_400_000;

export function toDayNumber(dateKey: string): DayNumber {
	const [year, month, day] = dateKey.split('-').map(Number);
	return (Date.UTC(year, month - 1, day) / DAY_MS) as DayNumber;
}

export function fromDayNumber(day: number): string {
	return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The visible dates as a value. Equal keys mean an equal window. */
export interface DayWindow {
	readonly key: string;
	readonly start: DayNumber;
	readonly days: number;
}

export function dayWindow(firstDateKey: string, days: number): DayWindow {
	return { key: `${firstDateKey}+${days}`, start: toDayNumber(firstDateKey), days };
}
