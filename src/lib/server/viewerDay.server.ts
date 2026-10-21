import type { Cookies } from '@sveltejs/kit';
import { isTimeZone, localDateIn } from '$lib/utils/dates';
import { VIEWER_TIME_ZONE_COOKIE } from '$lib/utils/viewerTimeZone';

/** The viewer's IANA time zone from their cookie, or 'UTC' when it is missing or invalid. */
export function viewerTimeZone(cookies: Pick<Cookies, 'get'>): string {
	const timeZone = cookies.get(VIEWER_TIME_ZONE_COOKIE);
	return isTimeZone(timeZone) ? timeZone : 'UTC';
}

/**
 * The viewer's "YYYY-MM-DD" day from their time zone cookie, or the UTC day when it is missing or invalid.
 * A load that reads it or `viewerTimeZone` declares `depends(VIEWER_DAY_DEPENDENCY)`.
 */
export function viewerToday(cookies: Pick<Cookies, 'get'>, now = new Date()): string {
	return localDateIn(viewerTimeZone(cookies), now);
}
