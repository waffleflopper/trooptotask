import { isTimeZone } from './dates';

/** Holds the browser's IANA time zone so server reads can use the viewer's calendar day. */
export const VIEWER_TIME_ZONE_COOKIE = 't2t_tz';

/** Every load that reads the viewer's day depends on this, so a newly recorded zone reruns only those loads. */
export const VIEWER_DAY_DEPENDENCY = 'app:viewer-day';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function storedTimeZone(): string | undefined {
	const prefix = `${VIEWER_TIME_ZONE_COOKIE}=`;
	return document.cookie
		.split('; ')
		.find((cookie) => cookie.startsWith(prefix))
		?.slice(prefix.length);
}

/**
 * Writes the browser's time zone cookie when it is missing or stale.
 * Returns true only when the cookie now holds a new zone, so the caller knows server data read the wrong day.
 */
export function rememberViewerTimeZone(): boolean {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	if (!isTimeZone(timeZone) || storedTimeZone() === timeZone) return false;
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `${VIEWER_TIME_ZONE_COOKIE}=${timeZone}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
	return storedTimeZone() === timeZone;
}
