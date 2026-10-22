import type { DayNumber } from '$lib/utils/dayNumber';
import type { TrackId, WeekendMode } from './rosterTypes';

const TRACKS: Record<WeekendMode, readonly TrackId[]> = {
	same: ['all'],
	separate: ['weekday', 'weekend'],
	none: ['weekday']
};

export function tracksOf(mode: WeekendMode): readonly TrackId[] {
	return TRACKS[mode];
}

/** The track a date counts on, or null when the date is not a detail date ('none' on a weekend or holiday). */
export function trackOf(mode: WeekendMode, day: DayNumber, holidays: ReadonlySet<number>): TrackId | null {
	if (mode === 'same') return 'all';
	// Day 0 is Thursday 1 Jan 1970, so (day + 4) % 7 is 0 on Sunday and 6 on Saturday.
	const weekday = (day + 4) % 7;
	const weekendOrHoliday = weekday === 0 || weekday === 6 || holidays.has(day);
	if (!weekendOrHoliday) return 'weekday';
	return mode === 'separate' ? 'weekend' : null;
}
