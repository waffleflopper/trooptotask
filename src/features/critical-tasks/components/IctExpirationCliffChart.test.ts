// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctExpirationCliffChart from './IctExpirationCliffChart.svelte';
import type { IctExpirationCliff } from '$features/critical-tasks/utils/ictReports';

const expirationCliff: IctExpirationCliff = {
	mosSeries: ['68W', '11B'],
	months: [
		{
			month: '2026-04',
			label: 'Apr 2026',
			totalExpiringCount: 0,
			mosSegments: [
				{ mos: '68W', expiringCount: 0 },
				{ mos: '11B', expiringCount: 0 }
			]
		},
		{
			month: '2026-05',
			label: 'May 2026',
			totalExpiringCount: 1,
			mosSegments: [
				{ mos: '68W', expiringCount: 1 },
				{ mos: '11B', expiringCount: 0 }
			]
		},
		{
			month: '2026-06',
			label: 'Jun 2026',
			totalExpiringCount: 2,
			mosSegments: [
				{ mos: '68W', expiringCount: 1 },
				{ mos: '11B', expiringCount: 1 }
			]
		},
		{
			month: '2026-07',
			label: 'Jul 2026',
			totalExpiringCount: 1,
			mosSegments: [
				{ mos: '68W', expiringCount: 0 },
				{ mos: '11B', expiringCount: 1 }
			]
		},
		{
			month: '2026-08',
			label: 'Aug 2026',
			totalExpiringCount: 0,
			mosSegments: [
				{ mos: '68W', expiringCount: 0 },
				{ mos: '11B', expiringCount: 0 }
			]
		},
		{
			month: '2026-09',
			label: 'Sep 2026',
			totalExpiringCount: 0,
			mosSegments: [
				{ mos: '68W', expiringCount: 0 },
				{ mos: '11B', expiringCount: 0 }
			]
		}
	],
	projectedReadinessAtMonth6: {
		month: '2026-09',
		label: 'Sep 2026',
		readinessPercent: 20,
		readyCount: 1,
		applicableCount: 5
	}
};

describe('IctExpirationCliffChart', () => {
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

	it('renders an accessible solid-color stacked expiration chart with a text fallback table', () => {
		render(IctExpirationCliffChart, { props: { cliff: expirationCliff, currentReadinessPercent: 67 } });

		const region = screen.getByRole('region', { name: 'Expiration Cliff — Next 6 Months' });
		expect(region.getAttribute('data-report-chart-section')).toBe('true');
		expect(within(region).getByText('Tasks lapsing by month')).toBeTruthy();
		expect(within(region).getByText('Projected unit readiness without retraining:')).toBeTruthy();
		expect(within(region).getByText('20% by SEP 2026')).toBeTruthy();
		expect(within(region).getByText('- a 47-point drop from current.')).toBeTruthy();
		expect(within(region).getByRole('img', { name: '6-month expiration cliff chart' })).toBeTruthy();
		expect(region.querySelectorAll('pattern[id^="expiration-cliff-pattern-"]')).toHaveLength(0);
		const bars = [...region.querySelectorAll('.expiration-bar')];
		expect(bars.length).toBeGreaterThan(0);
		expect(bars.some((bar) => bar.getAttribute('fill') === '#ba7517')).toBe(true);
		expect(bars.every((bar) => bar.getAttribute('fill') !== 'black')).toBe(true);

		const legend = within(region).getByRole('list', { name: 'Expiration cliff MOS series' });
		expect(within(legend).getByText('68W')).toBeTruthy();
		expect(within(legend).getByText('11B')).toBeTruthy();

		const fallbackTable = within(region).getByRole('table', { name: '6-month expiration cliff data' });
		expect(within(fallbackTable).getByRole('columnheader', { name: 'Month' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: 'Total expiring' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: '68W expiring' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: '11B expiring' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('cell', { name: 'Jun 2026' })).toBeTruthy();
		expect(within(fallbackTable).getAllByRole('cell', { name: '2' }).length).toBeGreaterThan(0);
	});

	it('shows only the hovered MOS segment in the tooltip', async () => {
		render(IctExpirationCliffChart, { props: { cliff: expirationCliff, currentReadinessPercent: 67 } });

		const region = screen.getByRole('region', { name: 'Expiration Cliff — Next 6 Months' });
		const hoverLayer = region.querySelector('.TooltipContext');
		expect(hoverLayer).toBeTruthy();
		const hoverRect = region.querySelectorAll('.tooltip-rects rect')[2];
		expect(hoverRect).toBeTruthy();

		await fireEvent.pointerEnter(hoverRect as SVGRectElement, { clientX: 360, clientY: 160 });
		await fireEvent.pointerMove(hoverRect as SVGRectElement, { clientX: 360, clientY: 160 });

		const tooltip = region.querySelector('.expiration-tooltip');
		expect(tooltip).toBeTruthy();
		const has68W = tooltip?.textContent?.includes('68W') ?? false;
		const has11B = tooltip?.textContent?.includes('11B') ?? false;
		expect(has68W || has11B).toBe(true);
		expect(has68W && has11B).toBe(false);
		expect(tooltip?.textContent).not.toContain('tasks lapsing');
		expect(tooltip?.querySelectorAll('.expiration-tooltip-row')).toHaveLength(1);
	});

	it('shows a clear empty state when no completions expire in the next six months', () => {
		render(IctExpirationCliffChart, {
			props: {
				cliff: {
					...expirationCliff,
					mosSeries: [],
					months: expirationCliff.months.map((month) => ({
						...month,
						totalExpiringCount: 0,
						mosSegments: []
					})),
					projectedReadinessAtMonth6: {
						month: '2026-09',
						label: 'Sep 2026',
						readinessPercent: 100,
						readyCount: 5,
						applicableCount: 5
					}
				}
			}
		});

		const region = screen.getByRole('region', { name: 'Expiration Cliff — Next 6 Months' });
		expect(
			within(region).getByText('No task completions expire in the next 6 months for the active filters.')
		).toBeTruthy();
		expect(within(region).queryByRole('img', { name: '6-month expiration cliff chart' })).toBeNull();
		expect(within(region).queryByText('Projected unit readiness without retraining:')).toBeNull();
		expect(within(region).queryByText('100% by SEP 2026')).toBeNull();
	});
});
