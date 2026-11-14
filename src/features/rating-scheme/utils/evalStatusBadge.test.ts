import { describe, expect, it } from 'vitest';
import { evaluation } from './ratingSchemeLineTestData';
import { evalStatusBadge } from './evalStatusBadge';

const today = new Date('2026-11-13T12:00:00');

describe('evalStatusBadge', () => {
	it('shows nothing for no Evaluation, an untracked one or a completed one', () => {
		expect(evalStatusBadge(null, today)).toBeNull();
		expect(evalStatusBadge(evaluation('e', 's', { workflowStatus: null }), today)).toBeNull();
		expect(evalStatusBadge(evaluation('e', 's', { workflowStatus: 'completed' }), today)).toBeNull();
	});

	it('shows only the step while thru is more than 60 days out', () => {
		const badge = evalStatusBadge(
			evaluation('e', 's', { workflowStatus: 'with-rater', ratingPeriodEnd: '2027-01-13' }),
			today
		);
		expect(badge).toMatchObject({ step: 2, stepCount: 5, label: 'With Rater', thru: null });
	});

	it.each([
		['2027-01-12', 'due-60', 'Thru in 60d'],
		['2026-12-13', 'due-30', 'Thru in 30d'],
		['2026-11-08', 'overdue', '5d past thru']
	])('adds thru urgency for a thru of %s', (ratingPeriodEnd, status, text) => {
		const badge = evalStatusBadge(
			evaluation('e', 's', { workflowStatus: 'with-senior-rater', ratingPeriodEnd }),
			today
		);
		expect(badge?.thru).toEqual({ status, text });
	});

	it('drops thru urgency once the Evaluation is at HRC, even past thru', () => {
		const badge = evalStatusBadge(
			evaluation('e', 's', { workflowStatus: 'submitted-to-hrc', ratingPeriodEnd: '2026-11-08' }),
			today
		);
		expect(badge).toMatchObject({ step: 5, label: 'Submitted to HRC', thru: null });
	});

	it('names the report for the hover detail', () => {
		const badge = evalStatusBadge(evaluation('e', 's', { reportType: 'AN', evalType: 'NCOER' }), today);
		expect(badge?.title).toBe('Annual NCOER');
	});
});
