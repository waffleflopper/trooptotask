// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
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

afterEach(() => cleanup());

describe('IctReadinessTrendChart', () => {
	it('renders readiness trend through the shared report chart with fallback data', () => {
		const { container } = render(IctReadinessTrendChart, { props: { trend: readinessTrend } });

		const section = container.querySelector('[data-report-chart-section="true"]') as HTMLElement;
		expect(section).toBeTruthy();
		expect(within(section).getByText('Readiness Trend - 12 Months')).toBeTruthy();
		expect(
			within(section).getByText('Unit readiness over time with top MOS comparisons by filtered headcount.')
		).toBeTruthy();
		expect(within(section).getByRole('figure', { name: '12-month readiness trend chart' })).toBeTruthy();
		expect(within(section).getByRole('list', { name: '12-month readiness trend chart series' })).toBeTruthy();
		expect(within(section).getByText('Unit')).toBeTruthy();
		expect(within(section).getByText('11B')).toBeTruthy();
		expect(within(section).getByText('68W')).toBeTruthy();

		const fallbackTable = within(section).getByRole('table', { name: '12-month readiness trend data' });
		expect(within(fallbackTable).getByRole('columnheader', { name: 'Month' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: 'Unit-wide readiness' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('columnheader', { name: '11B readiness' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('cell', { name: 'Mar 2026' })).toBeTruthy();
		expect(within(fallbackTable).getByRole('cell', { name: '75%' })).toBeTruthy();
	});

	it('shows an empty report state when no readiness cells exist', () => {
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

		expect(screen.getByText('No readiness trend data is available for the active filters.')).toBeTruthy();
		expect(screen.queryByRole('figure', { name: '12-month readiness trend chart' })).toBeNull();
	});

	it('uses the full readiness scale note when visible readiness falls below 50%', () => {
		render(IctReadinessTrendChart, {
			props: {
				trend: {
					comparisonMos: ['11B'],
					months: [
						{
							month: '2026-03',
							label: 'Mar 2026',
							overallReadinessPercent: 64,
							overallReadyCount: 16,
							overallApplicableCount: 25,
							mosReadiness: [
								{ mos: '11B', personnelCount: 10, readinessPercent: 48, readyCount: 12, applicableCount: 25 }
							]
						}
					]
				}
			}
		});

		expect(screen.getByText('Readiness fell below 50%, so this chart uses the full 0-100% scale.')).toBeTruthy();
	});
});
