import { formatDate, parseDate } from '$lib/utils/dates';

export const CALENDAR_ANCHOR_COOKIE = 'ttt-calendar-anchor-date';

const CALENDAR_ANCHOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value: string): boolean {
	return ISO_DATE_PATTERN.test(value) && formatDate(parseDate(value)) === value;
}

export function parseCalendarAnchorDate(value: string | null | undefined): Date | null {
	if (!value || !isValidDateOnly(value)) {
		return null;
	}

	return parseDate(value);
}

export function resolveCalendarAnchorDate(value: string | null | undefined, fallbackDate: Date): Date {
	return parseCalendarAnchorDate(value) ?? fallbackDate;
}

export function buildCalendarAnchorCookie(anchorDate: Date): string {
	return `${CALENDAR_ANCHOR_COOKIE}=${formatDate(anchorDate)}; Path=/; Max-Age=${CALENDAR_ANCHOR_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
