import { calendarDayDiff, formatDate, parseDate } from '$lib/utils/dates';
import { calculateExpirationDate } from './trainingStatus';

export type RenewalTimeline = {
	done: string;
	firstWarning: string;
	finalWarning: string;
	expires: string;
	/** Where each warning starts along the bar, as a share of the span from done to expires. */
	firstWarningShare: number;
	finalWarningShare: number;
};

function daysBefore(date: string, days: number): string {
	const day = parseDate(date);
	day.setDate(day.getDate() - days);
	return formatDate(day);
}

/** A training done on `done`, with when each warning starts. Null while the draft cannot be drawn. */
export function renewalTimeline(
	done: string,
	months: number,
	firstWarningDays: number,
	finalWarningDays: number
): RenewalTimeline | null {
	if (![months, firstWarningDays, finalWarningDays].every(Number.isInteger) || months < 1) return null;
	const expires = calculateExpirationDate(done, months);
	if (!expires) return null;
	const span = calendarDayDiff(parseDate(done), parseDate(expires));
	const share = (days: number) => Math.min(1, Math.max(0, (span - days) / span));
	return {
		done,
		firstWarning: daysBefore(expires, firstWarningDays),
		finalWarning: daysBefore(expires, finalWarningDays),
		expires,
		firstWarningShare: share(firstWarningDays),
		finalWarningShare: share(finalWarningDays)
	};
}
