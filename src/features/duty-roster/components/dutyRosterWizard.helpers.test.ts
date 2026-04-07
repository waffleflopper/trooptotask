import { describe, expect, it, vi } from 'vitest';
import { addCalendarDays, getTodayDate } from './dutyRosterWizard.helpers';

describe('dutyRosterWizard.helpers date helpers', () => {
	it('adds calendar days without shifting across UTC boundaries', () => {
		expect(addCalendarDays('2026-04-10', 1)).toBe('2026-04-11');
		expect(addCalendarDays('2026-04-01', -1)).toBe('2026-03-31');
	});

	it('returns the local calendar date instead of the UTC iso date', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 3, 7, 23, 45, 0));

		expect(getTodayDate()).toBe('2026-04-07');

		vi.useRealTimers();
	});
});
