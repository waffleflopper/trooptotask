import { describe, it, expect } from 'vitest';
import { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from './ratingScheme';

describe('getRatingDueStatus', () => {
	const today = new Date('2026-03-19T12:00:00');

	it.each([
		['2026-03-18', -1, 'overdue'],
		['2026-03-19', 0, 'due-30'],
		['2026-04-18', 30, 'due-30'],
		['2026-04-19', 31, 'due-60'],
		['2026-05-18', 60, 'due-60'],
		['2026-05-19', 61, 'current']
	] as const)('classifies the %s calendar-day boundary (%i days)', (end, days, status) => {
		expect(getRatingDueStatus(end, 'active', today)).toBe(status);
		// Numeric equality treats today's -0 and 0 as the same day count.
		expect(getDaysUntilDue(end, today) === days).toBe(true);
	});

	it('excludes completed past evaluations from overdue counts', () => {
		expect(getRatingDueStatus('2026-03-01', 'completed', today)).toBe('completed');
	});

	it('keeps a change-of-rater record subject to due warnings', () => {
		expect(getRatingDueStatus('2026-04-18', 'change-of-rater', today)).toBe('due-30');
	});
});

describe('getDaysUntilDue', () => {
	it('returns positive days for future date', () => {
		const today = new Date('2026-03-19T12:00:00');
		expect(getDaysUntilDue('2026-03-29', today)).toBe(10);
	});

	it('returns negative days for past date', () => {
		const today = new Date('2026-03-19T12:00:00');
		expect(getDaysUntilDue('2026-03-09', today)).toBe(-10);
	});
});

describe('getReportTypeLabel', () => {
	it('returns label for OER report type', () => {
		expect(getReportTypeLabel('AN', 'OER')).toBe('Annual');
	});

	it('returns label for NCOER report type', () => {
		expect(getReportTypeLabel('CR', 'NCOER')).toBe('Change of Rater');
	});

	it('returns empty string for null report type', () => {
		expect(getReportTypeLabel(null, 'OER')).toBe('');
	});
});
