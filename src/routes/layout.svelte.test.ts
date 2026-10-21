// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { viewerToday } from '$lib/server/viewerDay.server';
import Layout from './+layout.svelte';

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(async (_dependency: string) => {}) }));
vi.mock('$app/navigation', () => ({ invalidate }));

const children = createRawSnippet(() => ({ render: () => '<main>page</main>' }));
const now = new Date('2026-10-15T02:00:00Z');
const originalTimezone = process.env.TZ;

function readCookie(name: string): string | undefined {
	return document.cookie
		.split('; ')
		.find((cookie) => cookie.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

const serverDay = () => viewerToday({ get: readCookie }, now);

beforeEach(() => {
	process.env.TZ = 'America/New_York';
});

afterEach(() => {
	cleanup();
	invalidate.mockClear();
	Reflect.deleteProperty(document, 'cookie');
	document.cookie = 't2t_tz=; Path=/; Max-Age=0';
	if (originalTimezone === undefined) delete process.env.TZ;
	else process.env.TZ = originalTimezone;
});

describe('root layout viewer day', () => {
	it('reruns only the viewer-day loads, on the browser day, when the first visit has no time zone cookie', () => {
		expect(serverDay()).toBe('2026-10-15');

		render(Layout, { props: { children } });

		expect(serverDay()).toBe('2026-10-14');
		expect(invalidate.mock.calls).toEqual([['app:viewer-day']]);
	});

	it('reruns the viewer-day loads once on the browser day when the cookie names the zone the viewer left', () => {
		document.cookie = 't2t_tz=Asia/Seoul; Path=/';
		expect(serverDay()).toBe('2026-10-15');

		render(Layout, { props: { children } });

		expect(serverDay()).toBe('2026-10-14');
		expect(invalidate.mock.calls).toEqual([['app:viewer-day']]);
	});

	it('does not reload when the cookie already names the browser zone', () => {
		document.cookie = 't2t_tz=America/New_York; Path=/';

		render(Layout, { props: { children } });

		expect(invalidate).not.toHaveBeenCalled();
	});

	it('does not reload when the browser refuses to store the cookie', () => {
		Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: () => {} });

		render(Layout, { props: { children } });

		expect(serverDay()).toBe('2026-10-15');
		expect(invalidate).not.toHaveBeenCalled();
	});
});
