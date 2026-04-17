// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctReadinessTrendChart from './IctReadinessTrendChart.svelte';
import type { IctReadinessTrend } from '$features/critical-tasks/utils/ictReports';

const readinessTrend: IctReadinessTrend = {
	comparisonMos: ['11B', '68W'],
	months: [
		{
			month: '2026-03',
			label: 'Mar 2026',
			overallReadinessPercent: 75,
			overallReadyCount: 3,
			overallApplicableCount: 4,
			mosReadiness: [
				{ mos: '11B', personnelCount: 2, readinessPercent: 50, readyCount: 1, applicableCount: 2 },
				{ mos: '68W', personnelCount: 1, readinessPercent: 100, readyCount: 2, applicableCount: 2 }
			]
		},
		{
			month: '2026-04',
			label: 'Apr 2026',
			overallReadinessPercent: 100,
			overallReadyCount: 4,
			overallApplicableCount: 4,
			mosReadiness: [
				{ mos: '11B', personnelCount: 2, readinessPercent: 100, readyCount: 2, applicableCount: 2 },
				{ mos: '68W', personnelCount: 1, readinessPercent: 100, readyCount: 2, applicableCount: 2 }
			]
		}
	]
};

describe('IctReadinessTrendChart', () => {
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

	it('renders an accessible readiness trend region with a text fallback table', () => {
		render(IctReadinessTrendChart, { props: { trend: readinessTrend } });

		const region = screen.getByRole('region', { name: 'Readiness Trend - 12 Months' });
		expect(
			within(region).getByText('Unit readiness over time with top MOS comparisons by filtered headcount.')
		).toBeTruthy();
		const legend = within(region).getByRole('list', { name: 'Readiness trend series' });
		expect(within(legend).getByText('Unit')).toBeTruthy();
		expect(within(legend).getByText('11B')).toBeTruthy();
		expect(within(legend).getByText('68W')).toBeTruthy();
		expect(within(region).getByRole('img', { name: '12-month readiness trend chart' })).toBeTruthy();
		expect(within(region).getByTestId('layerchart-readiness-trend')).toBeTruthy();
		const yAxis = region.querySelector('.trend-y-axis');
		expect(yAxis).toBeTruthy();
		expect(yAxis?.getAttribute('aria-hidden')).toBe('true');
		expect(yAxis?.querySelector('.trend-y-axis-rule')).toBeTruthy();
		expect(yAxis?.textContent).toContain('50%');
		expect(yAxis?.textContent).toContain('100%');

		const paths = region.querySelectorAll('path.trend-line');
		expect(paths).toHaveLength(3);
		expect(paths[0].classList.contains('report-chart-line-solid')).toBe(true);
		expect(paths[1].classList.contains('report-chart-line-short-dash')).toBe(true);
		expect(paths[2].classList.contains('report-chart-line-long-dash')).toBe(true);
		for (const path of paths) {
			expect(path.getAttribute('fill')).toBe('none');
		}

		const fallbackTable = within(region).getByRole('table', { name: '12-month readiness trend data' });
		expect(within(fallbackTable).getByRole('columnheader', { name: 'Month' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: 'Unit-wide readiness' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: '11B readiness' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: '68W readiness' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('cell', { name: 'Mar 2026' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('cell', { name: '75%' })).toBeTruthy();
		expect(within(fallbackTable).getAllByRole('cell', { name: '100%' }).length).toBeGreaterThan(0);
	});

	it('shows a tooltip and highlighted points when hovering the chart', async () => {
		render(IctReadinessTrendChart, { props: { trend: readinessTrend } });

		const region = screen.getByRole('region', { name: 'Readiness Trend - 12 Months' });
		const hoverLayer = region.querySelector('.TooltipContext');
		expect(hoverLayer).toBeTruthy();

		await fireEvent.pointerEnter(hoverLayer as HTMLElement, { clientX: 360, clientY: 160 });
		await fireEvent.pointerMove(hoverLayer as HTMLElement, { clientX: 360, clientY: 160 });

		expect(region.querySelector('.trend-tooltip')).toBeTruthy();
		const tooltip = region.querySelector('.trend-tooltip');
		expect(tooltip?.textContent).toContain('Mar 2026');
		expect(tooltip?.textContent).toContain('Unit');
		expect(tooltip?.textContent).toContain('11B');
		expect(tooltip?.textContent).toContain('68W');
		expect(tooltip?.textContent).toContain('75%');
		expect(tooltip?.textContent).toContain('50%');
		expect(tooltip?.textContent).toContain('100%');
		expect(tooltip?.textContent).toContain('3/4 current');
		expect(tooltip?.textContent).toContain('1/2 current');
		expect(tooltip?.textContent).toContain('2/2 current');
		expect(tooltip?.querySelectorAll('.trend-tooltip-row')).toHaveLength(3);
		expect(tooltip?.querySelectorAll('.contents')).toHaveLength(0);
		expect(region.querySelectorAll('circle.trend-hover-point').length).toBeGreaterThan(0);
	});

	it('shows an edge state when no readiness cells exist for the active filters', () => {
		render(IctReadinessTrendChart, {
			props: {
				trend: {
					comparisonMos: [],
					months: [
						{
							month: '2026-04',
							label: 'Apr 2026',
							overallReadinessPercent: 0,
							overallReadyCount: 0,
							overallApplicableCount: 0,
							mosReadiness: []
						}
					]
				}
			}
		});

		const region = screen.getByRole('region', { name: 'Readiness Trend - 12 Months' });
		expect(within(region).getByText('No readiness trend data is available for the active filters.')).toBeTruthy();
		expect(within(region).queryByRole('img', { name: '12-month readiness trend chart' })).toBeNull();
	});
});
