// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import UpcomingLossesWidget from './UpcomingLossesWidget.svelte';
import type { UpcomingLossRecord } from '../utils/evaluateUpcomingLosses';

function makeLoss(overrides: Partial<UpcomingLossRecord> = {}): UpcomingLossRecord {
	return {
		id: 'loss-1',
		personId: 'p1',
		personName: 'SGT Taylor',
		rank: 'SGT',
		triggerType: 'ETS',
		targetDate: '2026-05-01',
		daysRemaining: 17,
		awardDueSoon: true,
		groupId: null,
		...overrides
	};
}

afterEach(() => {
	cleanup();
});

describe('UpcomingLossesWidget', () => {
	it('renders the empty state when there are no upcoming losses', () => {
		render(UpcomingLossesWidget, {
			props: {
				losses: [],
				formatDate: (date) => `Fmt ${date}`
			}
		});

		expect(screen.getByText('Upcoming Losses')).toBeTruthy();
		expect(screen.getByText('No personnel approaching ETS or PCS / DEROS window.')).toBeTruthy();
		expect(screen.queryByRole('list')).toBeNull();
	});

	it('renders labels, formatted dates, ordering, and award signals for provided loss entries', () => {
		render(UpcomingLossesWidget, {
			props: {
				losses: [
					makeLoss({
						id: 'loss-1',
						personId: 'p1',
						personName: 'SSG Taylor',
						rank: 'SSG',
						triggerType: 'PCS / DEROS',
						targetDate: '2026-04-20',
						daysRemaining: 6
					}),
					makeLoss({
						id: 'loss-2',
						personId: 'p2',
						personName: 'SGT Jordan',
						rank: 'SGT',
						triggerType: 'ETS',
						targetDate: '2026-05-01',
						daysRemaining: 17
					})
				],
				formatDate: (date) => `Fmt ${date}`
			}
		});

		const rows = screen.getAllByRole('listitem');

		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('Taylor');
		expect(rows[0].textContent).toContain('PCS / DEROS');
		expect(rows[0].textContent).toContain('Fmt 2026-04-20');
		expect(rows[0].textContent).toContain('6 days');
		expect(rows[1].textContent).toContain('Jordan');
		expect(rows[1].textContent).toContain('ETS');
		expect(rows[1].textContent).toContain('Fmt 2026-05-01');
		expect(rows[1].textContent).toContain('17 days');
		expect(screen.getAllByText('AWD')).toHaveLength(2);
	});

	it('omits the award signal when awardDueSoon is false', () => {
		render(UpcomingLossesWidget, {
			props: {
				losses: [makeLoss({ awardDueSoon: false })],
				formatDate: (date) => date
			}
		});

		expect(screen.queryByText('AWD')).toBeNull();
	});
});
