import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMonths, formatDate } from '$lib/utils/dates';

describe('calendarStore', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.resetModules();
	});

	it('opens on the first of the month on the 31st, so Prev and Next land on February 1 and April 1', async () => {
		vi.useFakeTimers({ now: new Date(2026, 2, 31, 9) });
		const { calendarStore } = await import('./calendar.svelte');

		expect(formatDate(calendarStore.currentDate)).toBe('2026-03-01');
		expect(formatDate(addMonths(calendarStore.currentDate, -1))).toBe('2026-02-01');
		expect(formatDate(addMonths(calendarStore.currentDate, 1))).toBe('2026-04-01');
	});
});
