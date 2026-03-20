import { describe, it, expect } from 'vitest';
import { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from './ratingScheme';

describe('getRatingDueStatus', () => {
	const today = new Date('2026-03-19T12:00:00');

	it('returns completed for completed status', () => {
		expect(getRatingDueStatus('2026-04-01', 'completed', today)).toBe('completed');
	});

	it('returns overdue when past end date', () => {
		expect(getRatingDueStatus('2026-03-01', 'active', today)).toBe('overdue');
	});

	it('returns due-30 when within 30 days', () => {
		expect(getRatingDueStatus('2026-04-10', 'active', today)).toBe('due-30');
	});

	it('returns due-60 when within 60 days', () => {
		expect(getRatingDueStatus('2026-05-10', 'active', today)).toBe('due-60');
	});

	it('returns current when more than 60 days away', () => {
		expect(getRatingDueStatus('2026-06-01', 'active', today)).toBe('current');
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
