export type DayNumber = number & { readonly __brand: 'DayNumber' };

export const DAY_MS = 86_400_000;

export function toDayNumber(dateKey: string): DayNumber {
	const [year, month, day] = dateKey.split('-').map(Number);
	return (Date.UTC(year, month - 1, day) / DAY_MS) as DayNumber;
}

export function fromDayNumber(day: number): string {
	return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export interface DayWindow {
	readonly key: string;
	readonly start: DayNumber;
	readonly days: number;
}

export function dayWindow(firstDateKey: string, days: number): DayWindow {
	return { key: `${firstDateKey}+${days}`, start: toDayNumber(firstDateKey), days };
}

/** The Monday on or before `dateKey`, as yyyy-mm-dd. */
export function mondayOf(dateKey: string): string {
	const day = toDayNumber(dateKey);
	// Day 0 is Thursday 1 Jan 1970, so (day + 4) % 7 is 0 on Sunday.
	return fromDayNumber(day - ((((day + 4) % 7) + 6) % 7));
}
