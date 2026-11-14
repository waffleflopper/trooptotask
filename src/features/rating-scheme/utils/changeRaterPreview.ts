import type { Evaluation } from '../rating-scheme.types';
import { calculateThruDate } from './ratingScheme';

/** A Change of Rater report is written only for a rating period of at least this many days. */
export const MIN_CHANGE_OF_RATER_DAYS = 90;

export interface ChangeRaterPreview {
	/** Days the current rater rated, counting the first and the last. */
	ratedDays: number;
	meetsMinimum: boolean;
	/** Where the open Evaluation closes, and where the next one starts and ends. */
	closes: { start: string; end: string };
	opens: { start: string; end: string } | null;
}

function nextDay(day: string): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

/** What Change rater does to the open Evaluation if it ran through `changeDate`; null when the date is outside its period. */
export function previewChangeOfRater(
	open: Pick<Evaluation, 'ratingPeriodStart' | 'ratingPeriodEnd'>,
	changeDate: string
): ChangeRaterPreview | null {
	if (!changeDate || changeDate < open.ratingPeriodStart || changeDate > open.ratingPeriodEnd) return null;
	const ratedDays =
		Math.round(
			(Date.parse(`${changeDate}T00:00:00Z`) - Date.parse(`${open.ratingPeriodStart}T00:00:00Z`)) / 86_400_000
		) + 1;
	const nextStart = nextDay(changeDate);
	const nextEnd = calculateThruDate('AN', nextStart);
	return {
		ratedDays,
		meetsMinimum: ratedDays >= MIN_CHANGE_OF_RATER_DAYS,
		closes: { start: open.ratingPeriodStart, end: changeDate },
		opens: nextEnd ? { start: nextStart, end: nextEnd } : null
	};
}
