// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { rememberViewerTimeZone } from '$lib/utils/viewerTimeZone';
import { viewerTimeZone, viewerToday } from './viewerDay.server';

const cookies = (value?: string) => ({ get: (name: string) => (name === 't2t_tz' ? value : undefined) });
const now = new Date('2026-10-15T00:30:00Z');

const originalTimezone = process.env.TZ;
afterEach(() => {
	document.cookie = 't2t_tz=; Path=/; Max-Age=0';
	if (originalTimezone === undefined) delete process.env.TZ;
	else process.env.TZ = originalTimezone;
});

function readCookie(name: string): string | undefined {
	return document.cookie
		.split('; ')
		.find((cookie) => cookie.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

describe('viewerTimeZone', () => {
	it('returns the zone the browser reported, or UTC for a missing or invalid cookie', () => {
		expect(viewerTimeZone(cookies('Pacific/Kiritimati'))).toBe('Pacific/Kiritimati');
		expect(viewerTimeZone(cookies())).toBe('UTC');
		expect(viewerTimeZone(cookies('Mars/Base'))).toBe('UTC');
	});
});

describe('viewerToday', () => {
	it('returns the day in the time zone the browser reported', () => {
		expect(viewerToday(cookies('America/New_York'), now)).toBe('2026-10-14');
		expect(viewerToday(cookies('Asia/Seoul'), now)).toBe('2026-10-15');
	});

	it.each([undefined, '', 'Mars/Base', 'America/New_York; Domain=evil.test'])(
		'falls back to the UTC day for the cookie %j',
		(value) => {
			expect(viewerToday(cookies(value), now)).toBe('2026-10-15');
		}
	);

	it('reads the browser zone after a stale cookie is replaced', () => {
		process.env.TZ = 'America/Chicago';
		document.cookie = 't2t_tz=UTC; Path=/';

		rememberViewerTimeZone();

		expect(readCookie('t2t_tz')).toBe('America/Chicago');
		expect(viewerToday({ get: readCookie }, new Date('2026-10-15T02:00:00Z'))).toBe('2026-10-14');
	});
});

describe('viewer-day loads', () => {
	const routeLoads = import.meta.glob<string>('/src/routes/**/+{page,layout}.server.ts', {
		query: '?raw',
		import: 'default',
		eager: true
	});

	it('every route load that reads the viewer day reruns when the browser records a new zone', () => {
		const readers = Object.keys(routeLoads).filter((path) => routeLoads[path].includes('viewerDay.server'));

		expect(readers).toContain('/src/routes/org/[orgId]/(dashboard)/+page.server.ts');
		expect(readers.filter((path) => !routeLoads[path].includes('VIEWER_DAY_DEPENDENCY'))).toEqual([]);
	});
});
