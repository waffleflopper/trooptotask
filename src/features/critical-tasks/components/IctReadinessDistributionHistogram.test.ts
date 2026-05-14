// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctReadinessDistributionHistogram from './IctReadinessDistributionHistogram.svelte';
import type { IctReadinessDistribution } from '$features/critical-tasks/utils/ictReports';

const bins = [
	{ key: '0-20', label: '0-20%', minPercent: 0, maxPercent: 20 },
	{ key: '20-40', label: '20-40%', minPercent: 20, maxPercent: 40 },
	{ key: '40-60', label: '40-60%', minPercent: 40, maxPercent: 60 },
	{ key: '60-80', label: '60-80%', minPercent: 60, maxPercent: 80 },
	{ key: '80-100', label: '80-100%', minPercent: 80, maxPercent: 100 }
];

const readinessDistribution: IctReadinessDistribution = {
	bins,
	defaultMos: '11B',
	series: [
		{
			mos: '11B',
			personnelCount: 3,
			bins: bins.map((bin, index) => ({ ...bin, soldierCount: [1, 0, 0, 1, 1][index] }))
		},
		{
			mos: '68W',
			personnelCount: 2,
			bins: bins.map((bin, index) => ({ ...bin, soldierCount: [0, 1, 0, 0, 1][index] }))
		}
	]
};

afterEach(() => cleanup());

describe('IctReadinessDistributionHistogram', () => {
	it('renders the default MOS and lets users switch histogram MOS', async () => {
		const { container } = render(IctReadinessDistributionHistogram, { props: { distribution: readinessDistribution } });

		const section = container.querySelector('[data-report-chart-section="true"]') as HTMLElement;
		expect(section).toBeTruthy();
		expect(within(section).getByText('Distribution - Individual Readiness by MOS')).toBeTruthy();
		expect(within(section).getByRole('figure', { name: 'Individual readiness distribution histogram' })).toBeTruthy();

		const select = within(section).getByRole('combobox', { name: 'Histogram MOS' });
		expect((select as HTMLSelectElement).value).toBe('11B');
		let table = within(section).getByRole('table', { name: 'Individual readiness distribution data' });
		expect(within(table).getByRole('columnheader', { name: '11B Soldiers' })).toBeTruthy();
		expect(within(table).getByRole('cell', { name: '0-20%' })).toBeTruthy();

		await fireEvent.change(select, { target: { value: '68W' } });

		expect((select as HTMLSelectElement).value).toBe('68W');
		table = within(section).getByRole('table', { name: 'Individual readiness distribution data' });
		expect(within(table).getByRole('columnheader', { name: '68W Soldiers' })).toBeTruthy();
		expect(within(section).getAllByText('68W (2 Soldiers)').length).toBeGreaterThan(0);
	});

	it('overlays multiple page-filtered MOS with the shared overlap bar chart', () => {
		render(IctReadinessDistributionHistogram, {
			props: { distribution: readinessDistribution, selectedPageMos: ['11B', '68W'] }
		});

		expect(screen.queryByRole('combobox', { name: 'Histogram MOS' })).toBeNull();
		expect(screen.getByText('Overlaying selected MOS filters.')).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Individual readiness distribution histogram series' })).toBeTruthy();
		expect(screen.getByText('11B (3 Soldiers)')).toBeTruthy();
		expect(screen.getByText('68W (2 Soldiers)')).toBeTruthy();
	});

	it('shows a clear empty state when no Soldiers match the selected MOS context', () => {
		render(IctReadinessDistributionHistogram, {
			props: { distribution: readinessDistribution, selectedPageMos: ['25U', '12N'] }
		});

		expect(screen.getByText('No Soldiers are available for the selected MOS/filter context.')).toBeTruthy();
		expect(screen.queryByRole('figure', { name: 'Individual readiness distribution histogram' })).toBeNull();
	});
});
