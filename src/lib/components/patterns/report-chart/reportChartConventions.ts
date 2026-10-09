export interface ReportChartSeriesConvention {
	color: string;
	className: string;
	patternLabel: string;
}

export const REPORT_CHART_SERIES: ReportChartSeriesConvention[] = [
	{
		color: 'var(--chart-1)',
		className: 'report-chart-line-solid',
		patternLabel: 'solid line'
	},
	{
		color: 'var(--chart-2)',
		className: 'report-chart-line-short-dash',
		patternLabel: 'short dash line'
	},
	{
		color: 'var(--chart-3)',
		className: 'report-chart-line-long-dash',
		patternLabel: 'long dash line'
	},
	{
		color: 'var(--chart-4)',
		className: 'report-chart-line-dot-dash',
		patternLabel: 'dot dash line'
	},
	{
		color: 'var(--chart-5)',
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

export interface ReportCountTickOptions {
	denseMax?: number;
	tickCount?: number;
}

export function buildReportCountTicks(maxValue: number, options: ReportCountTickOptions = {}): number[] {
	const denseMax = options.denseMax ?? 5;
	const tickCount = options.tickCount ?? 5;
	const normalizedMax = Math.max(0, Math.round(maxValue));

	if (normalizedMax <= denseMax) {
		return Array.from({ length: normalizedMax + 1 }, (_, index) => index);
	}

	const step = Math.ceil(normalizedMax / Math.max(1, tickCount - 1));
	const ticks = Array.from({ length: tickCount }, (_, index) => index * step);
	return ticks.at(-1) === normalizedMax ? ticks : [...ticks.filter((tick) => tick < normalizedMax), normalizedMax];
}
