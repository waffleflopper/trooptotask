import { describe, expect, it } from 'vitest';
import { formatDashboardDisplayDate } from './dashboardDate';

describe('formatDashboardDisplayDate', () => {
	it('formats dashboard breadcrumb dates with weekday and short month', () => {
		expect(formatDashboardDisplayDate('2026-04-26')).toBe('Sunday, Apr 26 2026');
	});
});
