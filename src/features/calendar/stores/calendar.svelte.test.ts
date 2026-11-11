// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '$lib/utils/dates';
import { CALENDAR_ANCHOR_COOKIE } from '../utils/calendarAnchorDate';

describe('calendarStore', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=; Max-Age=0; Path=/`;
		vi.useRealTimers();
	});

	it('opens on the current month with no cookie, focused on today', async () => {
		vi.useFakeTimers({ now: new Date(2026, 2, 31, 9) });
		const { calendarStore } = await import('./calendar.svelte');

		expect(formatDate(calendarStore.currentDate)).toBe('2026-03-01');
		expect(formatDate(calendarStore.focusDay)).toBe('2026-03-31');
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

	it('focuses today when the remembered month contains it, so a phone opens on this week', async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 20, 9) });
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=2026-10-01; Path=/`;
		const { calendarStore } = await import('./calendar.svelte');

		expect(formatDate(calendarStore.focusDay)).toBe('2026-10-20');
		expect(formatDate(calendarStore.currentDate)).toBe('2026-10-01');
		expect(calendarStore.weekDates.map(formatDate)).toEqual([
			'2026-10-19',
			'2026-10-20',
			'2026-10-21',
			'2026-10-22',
			'2026-10-23',
			'2026-10-24',
			'2026-10-25'
		]);
	});

	it('focuses the first of a remembered month that is not the current one', async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 20, 9) });
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=2026-12-01; Path=/`;
		const { calendarStore } = await import('./calendar.svelte');

		expect(formatDate(calendarStore.focusDay)).toBe('2026-12-01');
	});

	it('keeps the month and remembers it when the focus moves to a day in another month', async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 20, 9) });
		const { calendarStore } = await import('./calendar.svelte');

		calendarStore.goToDay(new Date(2026, 10, 3, 18));
		expect(formatDate(calendarStore.focusDay)).toBe('2026-11-03');
		expect([calendarStore.year, calendarStore.month, calendarStore.dates.length]).toEqual([2026, 10, 30]);
		vi.resetModules();
		const reloaded = await import('./calendar.svelte');

		expect(formatDate(reloaded.calendarStore.currentDate)).toBe('2026-11-01');
	});

	it('hands out the same month objects while the focus moves inside the month', async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 20, 9) });
		const { calendarStore } = await import('./calendar.svelte');
		const { currentDate, dates } = calendarStore;

		calendarStore.goToDay(new Date(2026, 9, 27));

		expect(calendarStore.currentDate).toBe(currentDate);
		expect(calendarStore.dates).toBe(dates);
	});

	it('makes the first of a month the focus when going to a month', async () => {
		vi.useFakeTimers({ now: new Date(2026, 9, 20, 9) });
		const { calendarStore } = await import('./calendar.svelte');

		calendarStore.goToMonth(2026, 11);

		expect(formatDate(calendarStore.focusDay)).toBe('2026-12-01');
		expect(calendarStore.weekDates.map(formatDate).at(0)).toBe('2026-11-30');
	});
});
