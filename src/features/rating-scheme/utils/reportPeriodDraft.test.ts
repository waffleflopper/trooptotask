import { describe, expect, it } from 'vitest';
import { reportPeriodProblem, withPeriodStart, withReportType } from './reportPeriodDraft';

const draft = { reportType: 'CR' as const, ratingPeriodStart: '2026-03-01', ratingPeriodEnd: '2026-06-30' };

describe('report and period draft', () => {
	it('fills an Annual thru in twelve months after its start', () => {
		expect(withReportType(draft, 'AN').ratingPeriodEnd).toBe('2027-02-28');
		expect(withPeriodStart({ ...draft, reportType: 'AN' }, '2026-11-09').ratingPeriodEnd).toBe('2027-11-08');
	});

	it('leaves the thru of any other report as chosen', () => {
		expect(withPeriodStart(draft, '2026-04-01').ratingPeriodEnd).toBe('2026-06-30');
		expect(withReportType(draft, 'EA').ratingPeriodEnd).toBe('2026-06-30');
	});

	it('needs both dates, the thru on or after the start', () => {
		expect(reportPeriodProblem(draft)).toBeNull();
		expect(reportPeriodProblem({ ...draft, ratingPeriodEnd: '2026-03-01' })).toBeNull();
		expect(reportPeriodProblem({ ...draft, ratingPeriodStart: '' })).not.toBeNull();
		expect(reportPeriodProblem({ ...draft, ratingPeriodEnd: '' })).not.toBeNull();
		expect(reportPeriodProblem({ ...draft, ratingPeriodEnd: '2026-02-28' })).not.toBeNull();
	});
});
