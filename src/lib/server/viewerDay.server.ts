import type { Cookies } from '@sveltejs/kit';
import { isTimeZone, localDateIn } from '$lib/utils/dates';
import { VIEWER_TIME_ZONE_COOKIE } from '$lib/utils/viewerTimeZone';

/** The viewer's "YYYY-MM-DD" day from their time zone cookie, or the UTC day when it is missing or invalid. */
export function viewerToday(cookies: Pick<Cookies, 'get'>, now = new Date()): string {
	const timeZone = cookies.get(VIEWER_TIME_ZONE_COOKIE);
	return localDateIn(isTimeZone(timeZone) ? timeZone : 'UTC', now);
}
