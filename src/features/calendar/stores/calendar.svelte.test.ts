// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '$lib/utils/dates';
import { CALENDAR_ANCHOR_COOKIE } from '../utils/calendarAnchorDate';

describe('calendarStore', () => {
	afterEach(() => {
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=; Max-Age=0; Path=/`;
		vi.useRealTimers();
		vi.resetModules();
	});

	it('opens on the first of the month on the 31st', async () => {
		vi.useFakeTimers({ now: new Date(2026, 2, 31, 9) });
		const { calendarStore } = await import('./calendar.svelte');

		expect(formatDate(calendarStore.currentDate)).toBe('2026-03-01');
	});

	it('reopens at the month the anchor cookie holds, the month the server bootstrapped', async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 20, 9) });
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=2026-12-01; Path=/`;
		const { calendarStore } = await import('./calendar.svelte');

		expect(formatDate(calendarStore.currentDate)).toBe('2026-12-01');
	});

	it('opens on the current month when the anchor cookie holds no date', async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 20, 9) });
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=not-a-date; Path=/`;
		const { calendarStore } = await import('./calendar.svelte');

		expect(formatDate(calendarStore.currentDate)).toBe('2026-10-01');
	});

	it('remembers the month it moves to for the next reload', async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 20, 9) });
		const { calendarStore } = await import('./calendar.svelte');

		calendarStore.goToMonth(2027, 0);
		vi.resetModules();
		const reloaded = await import('./calendar.svelte');

		expect(formatDate(reloaded.calendarStore.currentDate)).toBe('2027-01-01');
	});
});
