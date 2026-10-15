import { isTimeZone } from './dates';

/** Holds the browser's IANA time zone so server reads can use the viewer's calendar day. */
export const VIEWER_TIME_ZONE_COOKIE = 't2t_tz';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Writes the browser's time zone cookie when it is missing or stale. */
export function rememberViewerTimeZone(): void {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	if (!isTimeZone(timeZone)) return;
	const prefix = `${VIEWER_TIME_ZONE_COOKIE}=`;
	const stored = document.cookie
		.split('; ')
		.find((cookie) => cookie.startsWith(prefix))
		?.slice(prefix.length);
	if (stored === timeZone) return;
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `${prefix}${timeZone}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
