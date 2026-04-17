// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
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
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('renders an accessible solid-color stacked expiration chart with a text fallback table', () => {
		render(IctExpirationCliffChart, { props: { cliff: expirationCliff } });

		const region = screen.getByRole('region', { name: 'Expiration Cliff - 6 Months' });
		expect(within(region).getByText('Projected readiness at Sep 2026')).toBeTruthy();
		expect(within(region).getByText('20%')).toBeTruthy();
		expect(within(region).getByRole('img', { name: '6-month expiration cliff chart' })).toBeTruthy();
		expect(region.querySelectorAll('pattern[id^="expiration-cliff-pattern-"]')).toHaveLength(0);
		expect(region.querySelectorAll('.expiration-bar').length).toBeGreaterThan(0);

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

		const region = screen.getByRole('region', { name: 'Expiration Cliff - 6 Months' });
		expect(
			within(region).getByText('No task completions expire in the next 6 months for the active filters.')
		).toBeTruthy();
		expect(within(region).queryByRole('img', { name: '6-month expiration cliff chart' })).toBeNull();
		expect(within(region).getByText('100%')).toBeTruthy();
	});
});
