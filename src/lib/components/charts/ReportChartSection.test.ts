// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ReportChartSectionTest from './ReportChartSectionTest.svelte';

describe('ReportChartSection', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the shared accessible shell for report charts', () => {
		render(ReportChartSectionTest);

		const region = screen.getByRole('region', { name: 'Readiness Trend' });
		expect(region.getAttribute('aria-describedby')).toBe('test-chart-description');
		expect(region.getAttribute('aria-busy')).toBe('false');
		expect(region.getAttribute('data-report-chart-section')).toBe('true');
		expect(region.classList.contains('report-chart-section')).toBe(true);

		expect(within(region).getByText('% current')).toBeTruthy();
		expect(within(region).getByText('The chart body renders here.')).toBeTruthy();
		expect(within(region).getByText('Screen reader description for the chart.')).toBeTruthy();
	});

	it('announces the updating state without hiding the chart body', () => {
		render(ReportChartSectionTest, { props: { loading: true } });

		const region = screen.getByRole('region', { name: 'Readiness Trend' });
		expect(region.getAttribute('aria-busy')).toBe('true');
		expect(within(region).getByText('Updating')).toBeTruthy();
		expect(within(region).getByText('The chart body renders here.')).toBeTruthy();
	});
});
