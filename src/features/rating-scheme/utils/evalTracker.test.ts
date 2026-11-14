import { describe, expect, it } from 'vitest';
import type { WorkflowStatus } from '../rating-scheme.types';
import { toRatingSchemeEntry } from './ratingSchemeEntries';
import { byUrgency, isTrackerListed, nextPeriod, personEvaluations, readyToStart, waitingOnName } from './evalTracker';
import { evaluation, linePersonnel, scheme } from './ratingSchemeLineTestData';

const today = new Date(2026, 10, 13);

describe('Eval Tracker listing', () => {
	const listed = scheme('listed');
	const archived = scheme('archived', { archivedAt: '2026-10-01T00:00:00Z' });
	const entry = (status: WorkflowStatus | null, from = listed) =>
		toRatingSchemeEntry(from, evaluation(`e-${String(status)}`, from.id, { workflowStatus: status }));

	it('lists work in progress, Not tracked included, until it completes', () => {
		expect(isTrackerListed(entry('with-rater'), 'open')).toBe(true);
		expect(isTrackerListed(entry(null), 'open')).toBe(true);
		expect(isTrackerListed(entry('completed'), 'open')).toBe(false);
		expect(isTrackerListed(entry('completed'), 'completed')).toBe(true);
		expect(isTrackerListed(entry('with-rater'), 'completed')).toBe(false);
	});

	it('keeps an open Evaluation on an archived scheme, and its signed history', () => {
		expect(isTrackerListed(entry('with-rater', archived), 'open')).toBe(true);
		expect(isTrackerListed(entry(null, archived), 'all')).toBe(false);
		expect(isTrackerListed(entry('completed', archived), 'all')).toBe(true);
	});

	it('orders past thru first, then the nearest thru, then completed with the latest period first', () => {
		const rows = [
			{ id: 'current', ratingPeriodEnd: '2027-06-30', workflowStatus: 'drafting' as const },
			{ id: 'old-completed', ratingPeriodEnd: '2025-11-08', workflowStatus: 'completed' as const },
			{ id: 'thru-in-20', ratingPeriodEnd: '2026-12-03', workflowStatus: 'with-rater' as const },
			{ id: 'new-completed', ratingPeriodEnd: '2026-11-08', workflowStatus: 'completed' as const },
			{ id: 'past-5', ratingPeriodEnd: '2026-11-08', workflowStatus: 'with-senior-rater' as const },
			{ id: 'past-40', ratingPeriodEnd: '2026-10-04', workflowStatus: null }
		];
		expect(byUrgency(rows, today).map((row) => row.id)).toEqual([
			'past-40',
			'past-5',
			'thru-in-20',
			'current',
			'new-completed',
			'old-completed'
		]);
	});
});

describe('Ready to start', () => {
	it('lists listed schemes with every Evaluation completed, with the next Annual after the last thru', () => {
		const schemes = [
			scheme('done'),
			scheme('fresh', { ratedPersonId: 'park' }),
			scheme('open', { ratedPersonId: 'chen' }),
			scheme('untracked', { ratedPersonId: 'reyes' }),
			scheme('archived', { ratedPersonId: 'alvarez', archivedAt: '2026-10-01T00:00:00Z' })
		];
		const older = evaluation('older', 'done', { workflowStatus: 'completed', ratingPeriodEnd: '2025-11-08' });
		const latest = evaluation('latest', 'done', { workflowStatus: 'completed', ratingPeriodEnd: '2026-11-08' });
		const evaluations = [
			latest,
			older,
			evaluation('in-work', 'open', { workflowStatus: 'with-rater' }),
			evaluation('not-tracked', 'untracked', { workflowStatus: null })
		];

		expect(readyToStart(schemes, evaluations)).toEqual([
			{
				scheme: schemes[0],
				last: latest,
				next: { reportType: 'AN', ratingPeriodStart: '2026-11-09', ratingPeriodEnd: '2027-11-08' }
			},
			{ scheme: schemes[1], last: null, next: null }
		]);
	});

	it('starts the next period on the day after a month-end thru', () => {
		expect(nextPeriod({ ratingPeriodEnd: '2026-02-28' })).toEqual({
			reportType: 'AN',
			ratingPeriodStart: '2026-03-01',
			ratingPeriodEnd: '2027-02-28'
		});
	});
});

describe('Eval Tracker people', () => {
	it("lists a person's Evaluations across schemes, the latest period first", () => {
		const history = personEvaluations(
			[
				evaluation('first', 'old', { ratingPeriodEnd: '2024-11-08' }),
				evaluation('other-person', 'x', { ratedPersonId: 'park' }),
				evaluation('latest', 'new', { ratingPeriodEnd: '2026-11-08' })
			],
			'watanabe'
		);
		expect(history.map((row) => row.id)).toEqual(['latest', 'first']);
	});

	it('names who an Evaluation waits on from its chain, and an office for the command or HRC', () => {
		const chain = { ...scheme('s'), seniorRaterPersonId: null, seniorRaterName: 'COL External' };
		expect(waitingOnName('rater', chain, linePersonnel)).toBe('SSG Marisol Alvarez');
		expect(waitingOnName('seniorRater', chain, linePersonnel)).toBe('COL External');
		expect(waitingOnName('rated', chain, linePersonnel)).toBe('SGT Kenji Watanabe');
		expect(waitingOnName('reviewer', chain, linePersonnel)).toBeNull();
		expect(waitingOnName('rater', chain, [])).toBeNull();
		expect(waitingOnName('hrc', chain, linePersonnel)).toBe('HRC');
	});
});
