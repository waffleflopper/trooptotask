export interface ReportChartSeriesConvention {
	color: string;
	className: string;
	patternLabel: string;
}

export const REPORT_CHART_SERIES: ReportChartSeriesConvention[] = [
	{
		color: 'var(--trend-unit)',
		className: 'report-chart-line-solid',
		patternLabel: 'solid line'
	},
	{
		color: 'var(--trend-1)',
		className: 'report-chart-line-short-dash',
		patternLabel: 'short dash line'
	},
	{
		color: 'var(--trend-2)',
		className: 'report-chart-line-long-dash',
		patternLabel: 'long dash line'
	},
	{
		color: 'var(--trend-3)',
		className: 'report-chart-line-dot-dash',
		patternLabel: 'dot dash line'
	},
	{
		color: 'var(--trend-4)',
		className: 'report-chart-line-dotted',
		patternLabel: 'dotted line'
	}
];

export function readinessTrendDomain(values: number[]): [number, number] | null {
	if (values.length === 0) {
		return null;
	}

	return Math.min(...values) < 50 ? [0, 100] : [50, 100];
}
