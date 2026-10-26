import { describe, it, expect } from 'vitest';
import {
	getEvalTypeForRank,
	getRatingDueLabel,
	getRatingDueStatus,
	getDaysUntilDue,
	getReportTypeLabel
} from './ratingScheme';

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

	it('counts calendar days across a daylight-saving change regardless of the time of day', () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/New_York';
		try {
			const afterMidnight = new Date(2026, 9, 14, 0, 30);
			const lateEvening = new Date(2026, 2, 7, 23, 30);

			expect(getDaysUntilDue('2026-11-13', afterMidnight)).toBe(30);
			expect(getRatingDueStatus('2026-11-13', 'active', afterMidnight)).toBe('due-30');
			expect(getDaysUntilDue('2026-04-06', lateEvening)).toBe(30);
			expect(getRatingDueStatus('2026-04-06', 'active', lateEvening)).toBe('due-30');
		} finally {
			if (originalTimezone === undefined) delete process.env.TZ;
			else process.env.TZ = originalTimezone;
		}
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

describe('getEvalTypeForRank', () => {
	it.each([
		['2LT', 'OER'],
		['CPT', 'OER'],
		['GEN', 'OER'],
		['WO1', 'WOER'],
		['CW5', 'WOER'],
		['SGT', 'NCOER'],
		['CSM', 'NCOER'],
		['PV1', 'NCOER'],
		['SP4', 'NCOER'],
		['CIV', 'NCOER'],
		['ADM', 'NCOER'],
		['CWO3', 'NCOER'],
		['cpt', 'NCOER'],
		[' CPT', 'NCOER'],
		['', 'NCOER']
	])('maps %j to %s', (rank, evalType) => {
		expect(getEvalTypeForRank(rank)).toBe(evalType);
	});
});

describe('getRatingDueLabel', () => {
	const today = new Date('2026-03-19T12:00:00');

	it.each([
		['2026-03-01', 'active', { status: 'overdue', text: '18d past thru' }],
		['2026-03-18', 'active', { status: 'overdue', text: '1d past thru' }],
		['2026-03-19', 'active', { status: 'due-30', text: 'Thru in 0d' }],
		['2026-04-18', 'active', { status: 'due-30', text: 'Thru in 30d' }],
		['2026-04-19', 'active', { status: 'due-60', text: 'Thru in 31d' }],
		['2026-05-18', 'active', { status: 'due-60', text: 'Thru in 60d' }],
		['2026-05-19', 'active', { status: 'current', text: 'Current' }],
		['2026-03-01', 'completed', { status: 'completed', text: 'Completed' }],
		['2026-04-04', 'change-of-rater', { status: 'due-30', text: 'Thru in 16d' }]
	] as const)('labels %s for a %s entry', (end, status, expected) => {
		expect(getRatingDueLabel(end, status, today)).toEqual(expected);
	});
});
