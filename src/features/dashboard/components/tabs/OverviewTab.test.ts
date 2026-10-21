// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import OverviewTab from './OverviewTab.svelte';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';

afterEach(cleanup);

function names(prefix: string, count: number) {
	return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

function makeCtx(out: number): DashboardScreenModel {
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
		trainingStats: null,
		ratingStats: { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0 },
		trainingCurrencyPct: 100,
		activeOnboardings: [],
		groupBreakdown: [],
		availableCount: 1,
		totalPersonnel: 1,
		nonAvailablePersonnel: names('Out', out).map((personName, index) => ({
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

describe('OverviewTab Out Today toggle', () => {
	it('expands and collapses Out Today through a named, labelled control', async () => {
		render(OverviewTab, { props: { ctx: makeCtx(9) } });

		const toggle = screen.getByRole('button', { name: '+3 more in Out Today' });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		const listId = toggle.getAttribute('aria-controls')!;
		const items = document.getElementById(listId)!;
		expect(items.textContent).toContain('Out 6');
		expect(items.textContent).not.toContain('Out 7');

		await fireEvent.click(toggle);

		const expanded = screen.getByRole('button', { name: 'Show less in Out Today' });
		expect(expanded).toBe(toggle);
		expect(expanded.getAttribute('aria-expanded')).toBe('true');
		expect(document.getElementById(listId)!.textContent).toContain('Out 9');

		await fireEvent.click(expanded);

		expect(screen.getByRole('button', { name: '+3 more in Out Today' }).getAttribute('aria-expanded')).toBe('false');
		expect(document.getElementById(listId)!.textContent).not.toContain('Out 7');
	});

	it('shows no toggle when every row already fits', () => {
		render(OverviewTab, { props: { ctx: makeCtx(6) } });

		expect(screen.queryByRole('button', { name: /more in|Show less/ })).toBeNull();
	});
});
