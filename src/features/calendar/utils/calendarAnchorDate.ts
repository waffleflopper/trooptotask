import { formatDate, isDateOnly, parseDate } from '$lib/utils/dates';

export const CALENDAR_ANCHOR_COOKIE = 'ttt-calendar-anchor-date';

const CALENDAR_ANCHOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function parseCalendarAnchorDate(value: string | null | undefined): Date | null {
	if (!isDateOnly(value)) {
		return null;
	}

	return parseDate(value);
}

/** The anchor a `document.cookie` string holds, or null when it holds none or an invalid date. */
export function readCalendarAnchorCookie(cookies: string): Date | null {
	const prefix = `${CALENDAR_ANCHOR_COOKIE}=`;
	const value = cookies
		.split('; ')
		.find((cookie) => cookie.startsWith(prefix))
		?.slice(prefix.length);
	return parseCalendarAnchorDate(value);
}

export function resolveCalendarAnchorDate(value: string | null | undefined, fallbackDate: Date): Date {
	return parseCalendarAnchorDate(value) ?? fallbackDate;
}

export function buildCalendarAnchorCookie(anchorDate: Date): string {
	return `${CALENDAR_ANCHOR_COOKIE}=${formatDate(anchorDate)}; Path=/; Max-Age=${CALENDAR_ANCHOR_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
