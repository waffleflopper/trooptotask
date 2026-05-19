// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctExpirationCliffChart from './IctExpirationCliffChart.svelte';
import type { IctExpirationCliff } from '$features/critical-tasks/utils/ictReports';

const expirationCliff: IctExpirationCliff = {
	mosSeries: ['68W', '11B'],
	months: [
		{ month: '2026-04', label: 'Apr 2026', totalExpiringCount: 0, mosSegments: [] },
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

afterEach(() => cleanup());

describe('IctExpirationCliffChart', () => {
	it('renders a shared stacked report bar chart with projection and fallback data', () => {
		const { container } = render(IctExpirationCliffChart, {
			props: { cliff: expirationCliff, currentReadinessPercent: 67 }
		});

		const section = container.querySelector('[data-report-chart-section="true"]') as HTMLElement;
		expect(section).toBeTruthy();
		expect(within(section).getByText('Expiration Cliff - Next 6 Months')).toBeTruthy();
		expect(within(section).getByRole('figure', { name: '6-month expiration cliff chart' })).toBeTruthy();
		expect(within(section).getByRole('list', { name: '6-month expiration cliff chart series' })).toBeTruthy();
		expect(within(section).getByText('68W')).toBeTruthy();
		expect(within(section).getByText('11B')).toBeTruthy();
		expect(within(section).getByText(/20% by SEP 2026/)).toBeTruthy();
		expect(within(section).getByText(/a 47-point drop from current/)).toBeTruthy();

		const fallbackTable = within(section).getByRole('table', { name: '6-month expiration cliff data' });
		expect(within(fallbackTable).getByRole('columnheader', { name: 'Total expiring' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: '68W expiring' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('cell', { name: 'Jun 2026' })).toBeTruthy();
		expect(within(fallbackTable).getAllByRole('cell', { name: '2' }).length).toBeGreaterThan(0);

		const aprilRow = within(fallbackTable).getByRole('row', { name: 'Apr 2026 0 0 0' });
		expect(aprilRow).toBeTruthy();
	});

	it('shows a clear empty state when no completions expire', () => {
		render(IctExpirationCliffChart, {
			props: {
				cliff: {
					...expirationCliff,
					mosSeries: [],
					months: expirationCliff.months.map((month) => ({ ...month, totalExpiringCount: 0, mosSegments: [] })),
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

		expect(screen.getByText('No task completions expire in the next 6 months for the active filters.')).toBeTruthy();
		expect(screen.queryByRole('figure', { name: '6-month expiration cliff chart' })).toBeNull();
		expect(screen.queryByText(/Projected unit readiness without retraining/)).toBeNull();
	});
});
