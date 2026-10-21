import { describe, expect, it } from 'vitest';
import { formatDashboardDisplayDate, formatDashboardTitleDate } from './dashboardDate';

describe('formatDashboardDisplayDate', () => {
	it('formats dashboard breadcrumb dates with weekday and short month', () => {
		expect(formatDashboardDisplayDate('2026-04-26')).toBe('Sunday, Apr 26 2026');
	});
});

describe('formatDashboardTitleDate', () => {
	it('names the weekday, then the day and short month', () => {
		expect(formatDashboardTitleDate('2026-10-19')).toBe('Monday 19 Oct');
	});
});
