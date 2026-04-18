// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('IctReadinessDistributionHistogram', () => {
	beforeEach(() => {
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
			x: 0,
			y: 0,
			width: 720,
			height: 320,
			top: 0,
			right: 720,
			bottom: 320,
			left: 0,
			toJSON: () => ({})
		} as DOMRect);
		vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(720);
		vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
		vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(720);
		vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360);
		vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockReturnValue(0);
		vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(0);
		Object.defineProperty(HTMLElement.prototype, 'animate', {
			configurable: true,
			value: vi.fn(() => {
				const animation = {
					cancel: vi.fn(),
					currentTime: 0,
					effect: null,
					onfinish: null as ((event: Event) => void) | null,
					playState: 'finished'
				};
				queueMicrotask(() => animation.onfinish?.(new Event('finish')));
				return animation as unknown as Animation;
			})
		});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
	});

	it('renders the largest MOS by default and lets users switch histogram MOS', async () => {
		render(IctReadinessDistributionHistogram, { props: { distribution: readinessDistribution } });

		const region = screen.getByRole('region', { name: 'Distribution — Individual Readiness by MOS' });
		expect(region.getAttribute('data-report-chart-section')).toBe('true');
		expect(within(region).getByText('Soldiers grouped by individual readiness percentage.')).toBeTruthy();
		expect(within(region).getByRole('img', { name: 'Individual readiness distribution histogram' })).toBeTruthy();
		expect(within(region).getByTestId('layerchart-readiness-distribution')).toBeTruthy();

		const select = within(region).getByRole('combobox', { name: 'Histogram MOS' });
		expect((select as HTMLSelectElement).value).toBe('11B');
		const table = within(region).getByRole('table', { name: 'Individual readiness distribution data' });
		expect(within(table).getByRole('columnheader', { name: '11B Soldiers' })).toBeTruthy();
		expect(within(table).getByRole('cell', { name: '0-20%' })).toBeTruthy();

		await fireEvent.change(select, { target: { value: '68W' } });

		expect((select as HTMLSelectElement).value).toBe('68W');
		expect(within(table).getByRole('columnheader', { name: '68W Soldiers' })).toBeTruthy();
		expect(within(region).getByText('68W')).toBeTruthy();
	});

	it('overlays multiple page-filtered MOS with non-color-only series treatment and direct labels', () => {
		render(IctReadinessDistributionHistogram, {
			props: { distribution: readinessDistribution, selectedPageMos: ['11B', '68W'] }
		});

		const region = screen.getByRole('region', { name: 'Distribution — Individual Readiness by MOS' });
		expect(within(region).queryByRole('combobox', { name: 'Histogram MOS' })).toBeNull();
		expect(within(region).getByText('Overlaying selected MOS filters.')).toBeTruthy();
		const legend = within(region).getByRole('list', { name: 'Readiness distribution MOS series' });
		expect(within(legend).getByRole('listitem', { name: '11B, 3 Soldiers' })).toBeTruthy();
		expect(within(legend).getByRole('listitem', { name: '68W, 2 Soldiers' })).toBeTruthy();
		expect(within(legend).queryByText('solid line')).toBeNull();
		expect(within(legend).queryByText('short dash line')).toBeNull();

		const table = within(region).getByRole('table', { name: 'Individual readiness distribution data' });
		expect(within(table).getByRole('columnheader', { name: '11B Soldiers' })).toBeTruthy();
		expect(within(table).getByRole('columnheader', { name: '68W Soldiers' })).toBeTruthy();

		const bars = [...region.querySelectorAll('.distribution-bar')];
		expect(bars.length).toBeGreaterThan(0);
		expect(bars.some((bar) => bar.classList.contains('report-chart-line-solid'))).toBe(true);
		expect(bars.some((bar) => bar.classList.contains('report-chart-line-short-dash'))).toBe(true);
		expect(bars.every((bar) => bar.getAttribute('fill') !== 'black')).toBe(true);
		expect(bars.every((bar) => bar.getAttribute('stroke') !== null)).toBe(true);
	});

	it('shows a clear empty state when no Soldiers match the selected MOS context', () => {
		render(IctReadinessDistributionHistogram, {
			props: { distribution: readinessDistribution, selectedPageMos: ['25U', '12N'] }
		});

		const region = screen.getByRole('region', { name: 'Distribution — Individual Readiness by MOS' });
		expect(within(region).getByText('No Soldiers are available for the selected MOS/filter context.')).toBeTruthy();
		expect(within(region).queryByRole('img', { name: 'Individual readiness distribution histogram' })).toBeNull();
	});
});
