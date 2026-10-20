// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import OverviewTab from './OverviewTab.svelte';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';

afterEach(cleanup);

function names(prefix: string, count: number) {
	return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

function makeCtx(counts: { losses: number; changes: number; out: number }): DashboardScreenModel {
	return {
		unitReadiness: {
			availabilityColor: () => 'green',
			trainingCurrencyColor: () => 'green',
			availPct: 100,
			availColor: 'green',
			trainingColor: 'green',
			statusEntries: []
		},
		isFeatureOn: () => true,
		trainingGroupDelinquencies: [],
		dutyForDays: () => [],
		trainingStats: null,
		ratingStats: { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0 },
		expiredTrainingPersonnelCount: 0,
		trainingCurrencyPct: 100,
		activeOnboardings: [],
		groupBreakdown: [],
		availableCount: 1,
		totalPersonnel: 1,
		formatShortDate: (date: string) => date,
		upcomingLosses: names('Loss', counts.losses).map((personName, index) => ({
			personId: `loss-${index}`,
			personName,
			targetDate: '2026-09-21'
		})),
		upcomingChanges: names('Change', counts.changes).map((personName, index) => ({
			key: `change-${index}`,
			personName,
			date: '2026-09-21',
			direction: 'returning'
		})),
		nonAvailablePersonnel: names('Out', counts.out).map((personName, index) => ({
			id: `out-${index}`,
			personName,
			rank: 'SPC',
			statusTypeId: 'leave',
			statusName: 'Leave',
			statusColor: '#336699',
			statusTextColor: '#ffffff'
		}))
	} as unknown as DashboardScreenModel;
}

describe('OverviewTab overflow toggles', () => {
	it.each([
		{ list: 'Upcoming Losses', counts: { losses: 4, changes: 0, out: 0 }, prefix: 'Loss', shown: 3, hidden: 1 },
		{ list: 'Upcoming Changes', counts: { losses: 0, changes: 8, out: 0 }, prefix: 'Change', shown: 6, hidden: 2 },
		{ list: 'Out Today', counts: { losses: 0, changes: 0, out: 9 }, prefix: 'Out', shown: 6, hidden: 3 }
	])(
		'expands and collapses $list through a named, labelled control',
		async ({ list, counts, prefix, shown, hidden }) => {
			render(OverviewTab, { props: { ctx: makeCtx(counts) } });

			const toggle = screen.getByRole('button', { name: `+${hidden} more in ${list}` });
			expect(toggle.getAttribute('aria-expanded')).toBe('false');
			const listId = toggle.getAttribute('aria-controls')!;
			const items = document.getElementById(listId)!;
			expect(items.textContent).toContain(`${prefix} ${shown}`);
			expect(items.textContent).not.toContain(`${prefix} ${shown + 1}`);

			await fireEvent.click(toggle);

			const expanded = screen.getByRole('button', { name: `Show less in ${list}` });
			expect(expanded).toBe(toggle);
			expect(expanded.getAttribute('aria-expanded')).toBe('true');
			expect(document.getElementById(listId)!.textContent).toContain(`${prefix} ${shown + hidden}`);

			await fireEvent.click(expanded);

			expect(screen.getByRole('button', { name: `+${hidden} more in ${list}` }).getAttribute('aria-expanded')).toBe(
				'false'
			);
			expect(document.getElementById(listId)!.textContent).not.toContain(`${prefix} ${shown + 1}`);
		}
	);

	it('shows no toggle when every row already fits', () => {
		render(OverviewTab, { props: { ctx: makeCtx({ losses: 3, changes: 6, out: 6 }) } });

		expect(screen.queryByRole('button', { name: /more in|Show less/ })).toBeNull();
	});
});
