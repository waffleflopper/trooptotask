<script lang="ts">
	import { Highlight, LineChart } from 'layerchart';
	import { REPORT_CHART_SERIES, readinessTrendDomain } from '$lib/components/charts/reportChartConventions';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type {
		IctReadinessTrend,
		IctReadinessTrendMonth,
		IctReadinessTrendMosSnapshot
	} from '$features/critical-tasks/utils/ictReports';

	interface Props {
		trend: IctReadinessTrend;
		loading?: boolean;
	}

	interface TrendDatum {
		date: Date;
		label: string;
		value: number;
		readyCount: number;
		applicableCount: number;
	}

	interface TrendSeries {
		key: string;
		label: string;
		color: string;
		data: TrendDatum[];
		value: string;
		props: {
			class: string;
			strokeWidth: number;
		};
		patternLabel: string;
	}

	interface TooltipEntry {
		key: string;
		label: string;
		color: string;
		lineClass: string;
		percent: string;
		countText: string;
	}

	const TITLE_ID = 'ict-readiness-trend-title';
	const DESCRIPTION_ID = 'ict-readiness-trend-description';
	const DEFAULT_Y_DOMAIN: [number, number] = [50, 100];
	const TOOLTIP_WIDTH_PX = 240;
	const TOOLTIP_MARGIN_PX = 12;

	let { trend, loading = false }: Props = $props();

	const hasTrendData = $derived(
		trend.months.some(
			(month) => month.overallApplicableCount > 0 || month.mosReadiness.some((snapshot) => snapshot.applicableCount > 0)
		)
	);
	const chartValues = $derived.by(() => {
		if (!hasTrendData) return [];
		return trend.months.flatMap((month) => [
			month.overallReadinessPercent,
			...month.mosReadiness.map((snapshot) => snapshot.readinessPercent)
		]);
	});
	const yDomain = $derived(readinessTrendDomain(chartValues));
	const effectiveYDomain = $derived(yDomain ?? DEFAULT_Y_DOMAIN);
	const usesFullScale = $derived(yDomain?.[0] === 0);
	const chartSeries = $derived.by(() => buildChartSeries(trend.months));
	const chartData = $derived.by(() =>
		chartSeries.flatMap((series) => series.data).sort((left, right) => left.date.getTime() - right.date.getTime())
	);
	const xTicks = $derived(trend.months.map((month) => monthDate(month.month)));
	const xDomain = $derived.by((): [Date, Date] | undefined => {
		if (xTicks.length === 0) return undefined;
		const firstTick = xTicks[0];
		const lastTick = xTicks.at(-1) ?? firstTick;
		const edgePaddingDays = xTicks.length > 1 ? 14 : 18;
		return [addDays(firstTick, -edgePaddingDays), addDays(lastTick, edgePaddingDays)];
	});
	const yTicks = $derived.by(() => buildYTicks(effectiveYDomain));

	function monthDate(monthKey: string): Date {
		const [year, month] = monthKey.split('-').map(Number);
		return new Date(year, month - 1, 1);
	}

	function addDays(date: Date, days: number): Date {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
	}

	function formatPercent(value: number): string {
		return `${value}%`;
	}

	function formatLayerChartPercent(value: unknown): string {
		return formatPercent(Number(value));
	}

	function formatMonthShort(value: Date): string {
		return value.toLocaleString('en-US', { month: 'short' }).toUpperCase();
	}

	function formatLayerChartMonth(value: unknown): string {
		if (value instanceof Date) return formatMonthShort(value);
		return String(value);
	}

	function formatTooltipPercentValue(value: unknown): string {
		if (value === null || value === undefined || value === '') return '';
		const numericValue = Number(value);
		return Number.isFinite(numericValue) ? `${Math.round(numericValue)}%` : '';
	}

	function relatedTrendDatum(series: TrendSeries, tooltipData: unknown): TrendDatum | null {
		if (!tooltipData || typeof tooltipData !== 'object' || !(tooltipData as TrendDatum).date) {
			return null;
		}

		const tooltipDate = (tooltipData as TrendDatum).date;
		if (!(tooltipDate instanceof Date)) return null;

		return series.data.find((datum) => datum.date.getTime() === tooltipDate.getTime()) ?? null;
	}

	function mosSnapshot(month: IctReadinessTrendMonth, mos: string): IctReadinessTrendMosSnapshot | undefined {
		return month.mosReadiness.find((snapshot) => snapshot.mos === mos);
	}

	function buildYTicks(domain: [number, number]): number[] {
		if (domain[0] === 0) {
			return Array.from({ length: 6 }, (_, index) => index * 20);
		}

		return Array.from({ length: 11 }, (_, index) => 50 + index * 5);
	}

	function yTickTop(tick: number): number {
		const [min, max] = effectiveYDomain;
		if (max === min) return 0;
		return ((max - tick) / (max - min)) * 100;
	}

	function tooltipTrendDatum(value: unknown): TrendDatum | null {
		if (!value || typeof value !== 'object') return null;
		const datum = value as Partial<TrendDatum>;
		return datum.date instanceof Date ? (datum as TrendDatum) : null;
	}

	function tooltipMonthLabel(datum: TrendDatum): string {
		return datum.label;
	}

	function tooltipEntries(tooltipDatum: TrendDatum): TooltipEntry[] {
		return chartSeries.map((series) => {
			const datum = relatedTrendDatum(series, tooltipDatum);
			return {
				key: series.key,
				label: series.label,
				color: series.color,
				lineClass: series.props.class,
				percent: formatTooltipPercentValue(datum?.value ?? 0),
				countText: `${datum?.readyCount ?? 0}/${datum?.applicableCount ?? 0} current`
			};
		});
	}

	function numericTooltipCoordinate(value: unknown): number {
		const numericValue = Number(value);
		return Number.isFinite(numericValue) ? numericValue : 0;
	}

	function scaledTooltipCoordinate(scale: unknown, value: unknown): number {
		if (typeof scale !== 'function') return numericTooltipCoordinate(value);
		return numericTooltipCoordinate((scale as (input: unknown) => unknown)(value));
	}

	function tooltipBoundary(
		size: unknown,
		padding: { top?: number; right?: number; bottom?: number; left?: number } | undefined,
		axis: 'x' | 'y'
	): number {
		const numericSize = numericTooltipCoordinate(size);
		if (!padding) return numericSize;
		return axis === 'x'
			? numericSize + (padding.left ?? 0) + (padding.right ?? 0)
			: numericSize + (padding.top ?? 0) + (padding.bottom ?? 0);
	}

	function tooltipLeft(value: unknown, containerWidth: number): number {
		const x = numericTooltipCoordinate(value);
		const min = TOOLTIP_WIDTH_PX / 2 + TOOLTIP_MARGIN_PX;
		const max = Math.max(min, containerWidth - TOOLTIP_WIDTH_PX / 2 - TOOLTIP_MARGIN_PX);
		return Math.min(Math.max(x, min), max);
	}

	function tooltipTop(value: unknown, containerHeight: number): number {
		const y = numericTooltipCoordinate(value);
		const min = TOOLTIP_MARGIN_PX;
		const max = Math.max(min, containerHeight - TOOLTIP_MARGIN_PX);
		return Math.min(Math.max(y, min), max);
	}

	function tooltipPlacement(value: unknown): 'above' | 'below' {
		return numericTooltipCoordinate(value) < 120 ? 'below' : 'above';
	}

	function unitDatumForTooltip(tooltipDatum: TrendDatum): TrendDatum {
		const unitSeries = chartSeries[0];
		return unitSeries ? (relatedTrendDatum(unitSeries, tooltipDatum) ?? tooltipDatum) : tooltipDatum;
	}

	function trendTooltipX(tooltipDatum: TrendDatum, xScale: unknown, padding: { left?: number } | undefined): number {
		return (padding?.left ?? 0) + scaledTooltipCoordinate(xScale, tooltipDatum.date);
	}

	function trendTooltipY(tooltipDatum: TrendDatum, yScale: unknown, padding: { top?: number } | undefined): number {
		const unitDatum = unitDatumForTooltip(tooltipDatum);
		return (padding?.top ?? 0) + scaledTooltipCoordinate(yScale, unitDatum.value);
	}

	function toDatum(
		month: IctReadinessTrendMonth,
		value: number,
		readyCount: number,
		applicableCount: number
	): TrendDatum {
		return {
			date: monthDate(month.month),
			label: month.label,
			value,
			readyCount,
			applicableCount
		};
	}

	function buildChartSeries(months: IctReadinessTrendMonth[]): TrendSeries[] {
		const unitConvention = REPORT_CHART_SERIES[0];
		const series: TrendSeries[] = [
			{
				key: 'unit',
				label: 'Unit',
				color: unitConvention.color,
				data: months.map((month) =>
					toDatum(month, month.overallReadinessPercent, month.overallReadyCount, month.overallApplicableCount)
				),
				value: 'value',
				props: {
					class: unitConvention.className,
					strokeWidth: 2.5
				},
				patternLabel: unitConvention.patternLabel
			}
		];

		trend.comparisonMos.forEach((mos, index) => {
			const convention = REPORT_CHART_SERIES[(index + 1) % REPORT_CHART_SERIES.length];
			series.push({
				key: mos,
				label: mos,
				color: convention.color,
				data: months.map((month) => {
					const snapshot = mosSnapshot(month, mos);
					return toDatum(
						month,
						snapshot?.readinessPercent ?? 0,
						snapshot?.readyCount ?? 0,
						snapshot?.applicableCount ?? 0
					);
				}),
				value: 'value',
				props: {
					class: convention.className,
					strokeWidth: 1.5
				},
				patternLabel: convention.patternLabel
			});
		});

		return series;
	}
</script>

<section
	class="trend-card"
	aria-labelledby={TITLE_ID}
	aria-describedby={DESCRIPTION_ID}
	aria-busy={loading ? 'true' : 'false'}
>
	<div class="trend-card-header">
		<div>
			<h2 id={TITLE_ID}>Readiness Trend — 12 Months</h2>
			<p id={DESCRIPTION_ID} class="screen-reader-text">
				Unit readiness over time with top MOS comparisons by filtered headcount.
			</p>
		</div>
		<div class="trend-card-meta">
			<span class="chart-kicker">% current</span>
			{#if loading}
				<span class="chart-status">Updating</span>
			{/if}
		</div>
	</div>

	{#if !hasTrendData}
		<div class="empty-chart">
			<EmptyState message="No readiness trend data is available for the active filters." variant="simple" />
		</div>
	{:else}
		<div class="chart-canvas" role="img" aria-label="12-month readiness trend chart" aria-describedby={DESCRIPTION_ID}>
			<div class="trend-layer-chart" data-testid="layerchart-readiness-trend">
				<div class="trend-y-axis" aria-hidden="true">
					<span class="trend-y-axis-rule"></span>
					{#each yTicks as tick (tick)}
						<span class="trend-y-axis-tick" style:top={`${yTickTop(tick)}%`}>
							<span class="trend-y-axis-tick-line"></span>
							<span class="trend-y-axis-label">{formatPercent(tick)}</span>
						</span>
					{/each}
				</div>
				<LineChart
					data={chartData}
					flatData={chartData}
					x="date"
					{xDomain}
					yDomain={effectiveYDomain}
					yNice={false}
					series={chartSeries}
					axis="x"
					grid={{
						x: false,
						y: { class: 'chart-grid-line' },
						yTicks
					}}
					rule={false}
					legend={false}
					points={false}
					tooltip={{ mode: 'bisect-x', findTooltipData: 'closest', hideDelay: 40 }}
					padding={{ top: 16, right: 24, bottom: 44, left: 58 }}
					props={{
						svg: {
							class: 'trend-layer-svg',
							label: '12-month readiness trend chart',
							describedBy: DESCRIPTION_ID
						},
						spline: {
							fill: 'none',
							class: 'trend-line'
						},
						xAxis: {
							ticks: xTicks,
							format: formatLayerChartMonth,
							tickLength: 0,
							tickLabelProps: {
								rotate: 0,
								textAnchor: 'middle',
								verticalAnchor: 'middle',
								dx: 0,
								dy: 18,
								fill: 'var(--text-secondary)',
								stroke: 'none',
								class: 'chart-axis-label chart-axis-label-x'
							},
							classes: {
								root: 'chart-axis chart-axis-x',
								rule: 'chart-axis-rule',
								tick: 'chart-axis-tick',
								tickLabel: 'chart-axis-label'
							}
						},
						yAxis: {
							ticks: yTicks,
							format: formatLayerChartPercent,
							rule: true,
							tickLength: 6,
							tickLabelProps: {
								dx: -12,
								textAnchor: 'end',
								verticalAnchor: 'middle',
								fill: 'var(--text-secondary)',
								stroke: 'none',
								class: 'chart-axis-label chart-axis-label-y'
							},
							classes: {
								root: 'chart-axis chart-axis-y',
								rule: 'chart-axis-rule',
								tick: 'chart-axis-tick',
								tickLabel: 'chart-axis-label'
							}
						}
					}}
				>
					<svelte:fragment slot="highlight" let:visibleSeries let:tooltip>
						{#each visibleSeries as series, index (series.key)}
							{@const hoverDatum = relatedTrendDatum(series, tooltip.data)}
							<Highlight
								data={hoverDatum}
								y={series.value}
								motion={false}
								lines={index === 0
									? {
											class: 'trend-hover-line',
											stroke: 'var(--text-secondary)',
											strokeWidth: 1
										}
									: false}
								points={{
									fill: series.color,
									stroke: 'var(--surface-panel)',
									strokeWidth: 3,
									r: 4.5,
									class: 'trend-hover-point'
								}}
							/>
						{/each}
					</svelte:fragment>
					<svelte:fragment slot="tooltip" let:tooltip let:width let:height let:padding let:xScale let:yScale>
						{#if tooltip?.data}
							{@const tooltipDatum = tooltipTrendDatum(tooltip.data)}
							{#if tooltipDatum}
								{@const anchorX = trendTooltipX(tooltipDatum, xScale, padding)}
								{@const anchorY = trendTooltipY(tooltipDatum, yScale, padding)}
								<div
									class="trend-tooltip-root"
									data-placement={tooltipPlacement(anchorY)}
									style:left={`${tooltipLeft(anchorX, tooltipBoundary(width, padding, 'x'))}px`}
									style:top={`${tooltipTop(anchorY, tooltipBoundary(height, padding, 'y'))}px`}
								>
									<div class="trend-tooltip" role="status" aria-live="polite">
										<div class="trend-tooltip-header">{tooltipMonthLabel(tooltipDatum)}</div>
										<div class="trend-tooltip-list">
											{#each tooltipEntries(tooltipDatum) as entry (entry.key)}
												<div class="trend-tooltip-row">
													<span class="trend-tooltip-label">
														<svg class="trend-tooltip-series-line" viewBox="0 0 28 8" aria-hidden="true">
															<line
																class={entry.lineClass}
																x1="0"
																x2="28"
																y1="4"
																y2="4"
																stroke={entry.color}
																stroke-width="2.5"
																vector-effect="non-scaling-stroke"
															/>
														</svg>
														{entry.label}
													</span>
													<strong class="trend-tooltip-value">{entry.percent}</strong>
													<span class="trend-tooltip-count">{entry.countText}</span>
												</div>
											{/each}
										</div>
									</div>
								</div>
							{/if}
						{/if}
					</svelte:fragment>
				</LineChart>
			</div>
			<ul class="chart-legend" aria-label="Readiness trend series">
				{#each chartSeries as series (series.key)}
					<li aria-label={`${series.label}, ${series.patternLabel}`}>
						<svg class="legend-line" viewBox="0 0 34 8" aria-hidden="true">
							<line
								class={series.props.class}
								x1="0"
								x2="34"
								y1="4"
								y2="4"
								stroke={series.color}
								stroke-width={series.props.strokeWidth}
								vector-effect="non-scaling-stroke"
							/>
						</svg>
						<span class="legend-label">{series.label}</span>
					</li>
				{/each}
			</ul>
			{#if usesFullScale}
				<p class="scale-note">Readiness fell below 50%, so this chart uses the full 0-100% scale.</p>
			{/if}
		</div>

		<div class="fallback-table-scroll screen-reader-table">
			<table aria-label="12-month readiness trend data">
				<thead>
					<tr>
						<th scope="col">Month</th>
						<th scope="col" class="numeric">Unit-wide readiness</th>
						{#each trend.comparisonMos as mos (mos)}
							<th scope="col" class="numeric">{mos} readiness</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each trend.months as month (month.month)}
						<tr>
							<td>{month.label}</td>
							<td class="numeric">{formatPercent(month.overallReadinessPercent)}</td>
							{#each trend.comparisonMos as mos (mos)}
								<td class="numeric">{formatPercent(mosSnapshot(month, mos)?.readinessPercent ?? 0)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.trend-card {
		--trend-unit: var(--text-primary);
		--trend-1: var(--amber);
		--trend-2: #993c1d;
		--trend-3: var(--success);
		--trend-4: #534ab7;
		--chart-grid-line: color-mix(in srgb, var(--border-default) 44%, transparent);

		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		padding: var(--sp-5) var(--sp-6);
	}

	.trend-card-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-3);
		border-bottom: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent);
		padding-bottom: 14px;
	}

	.trend-card h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: var(--font-weight-semibold);
		line-height: 1;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.trend-card-meta {
		display: inline-flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--sp-2);
		min-width: 0;
	}

	.chart-kicker,
	.chart-status,
	.scale-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.chart-canvas {
		margin-top: 0;
	}

	.chart-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-4);
		margin: var(--sp-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.chart-legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.legend-line {
		display: block;
		flex: 0 0 auto;
		width: 1.125rem;
		height: 0.5rem;
		overflow: visible;
	}

	.scale-note {
		margin: var(--sp-3) 0 0;
	}

	.fallback-table-scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		min-width: 44rem;
		border-collapse: collapse;
	}

	th,
	td {
		padding: var(--sp-3) var(--sp-4);
		border-bottom: 0.5px solid var(--border-default);
		text-align: left;
		vertical-align: top;
	}

	thead th {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	tbody td {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	tbody tr:last-child td {
		border-bottom: 0;
	}

	.numeric {
		text-align: right;
		white-space: nowrap;
	}

	.screen-reader-text,
	.screen-reader-table {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.report-chart-line-solid {
		stroke-dasharray: none;
	}

	.report-chart-line-short-dash {
		stroke-dasharray: 7 5;
	}

	.report-chart-line-long-dash {
		stroke-dasharray: 13 6;
	}

	.report-chart-line-dot-dash {
		stroke-dasharray: 2 5 9 5;
	}

	.report-chart-line-dotted {
		stroke-dasharray: 2 5;
	}

	.trend-layer-chart {
		--trend-chart-padding-top: 16px;
		--trend-chart-padding-right: 24px;
		--trend-chart-padding-bottom: 44px;
		--trend-chart-padding-left: 58px;

		position: relative;
		height: 16.25rem;
		min-height: 15rem;
	}

	.trend-y-axis {
		position: absolute;
		top: var(--trend-chart-padding-top);
		bottom: var(--trend-chart-padding-bottom);
		left: 0;
		z-index: 2;
		width: var(--trend-chart-padding-left);
		pointer-events: none;
	}

	.trend-y-axis-rule {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 1px;
		background: color-mix(in srgb, var(--text-secondary) 62%, transparent);
	}

	.trend-y-axis-tick {
		position: absolute;
		right: 0;
		left: 0;
		height: 1px;
		transform: translateY(-0.5px);
	}

	.trend-y-axis-tick-line {
		position: absolute;
		top: 0;
		right: 0;
		width: 6px;
		border-top: 1px solid color-mix(in srgb, var(--border-default) 78%, transparent);
	}

	.trend-y-axis-label {
		position: absolute;
		top: 50%;
		right: 8px;
		transform: translateY(-50%);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.trend-layer-chart :global(.layercake-container) {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.trend-layer-chart :global(.layercake-layout-svg) {
		position: absolute;
		top: 0;
		left: 0;
		display: block;
		overflow: visible;
	}

	.trend-layer-chart :global(.overflow-visible) {
		overflow: visible;
	}

	.trend-layer-chart :global(.trend-line) {
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	.trend-layer-chart :global(.chart-axis-label) {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		fill: var(--text-secondary);
		opacity: 1;
		text-transform: uppercase;
	}

	.trend-layer-chart :global(.chart-axis-label-y) {
		stroke: none;
		text-anchor: end;
	}

	.trend-layer-chart :global(.chart-axis-rule),
	.trend-layer-chart :global(.chart-axis-tick) {
		stroke: color-mix(in srgb, var(--border-default) 78%, transparent);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.trend-layer-chart :global(.chart-axis-y .chart-axis-rule) {
		stroke: color-mix(in srgb, var(--text-secondary) 55%, transparent);
	}

	.trend-layer-chart :global(.grid line) {
		vector-effect: non-scaling-stroke;
	}

	.trend-layer-chart :global(.chart-grid-line) {
		stroke: var(--chart-grid-line);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.trend-layer-chart :global(.trend-hover-line) {
		stroke: color-mix(in srgb, var(--text-secondary) 62%, transparent);
		stroke-dasharray: 3 3;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}

	.trend-layer-chart :global(.trend-hover-point) {
		vector-effect: non-scaling-stroke;
		filter: drop-shadow(0 1px 2px rgba(14, 14, 13, 0.16));
		pointer-events: none;
	}

	.trend-layer-chart :global(.tooltip-rects rect),
	.trend-layer-chart :global(.fill-transparent) {
		fill: transparent;
		stroke: none;
	}

	.trend-layer-chart :global(.TooltipContext) {
		position: absolute;
		z-index: 1;
		touch-action: none;
	}

	.trend-layer-chart :global(.TooltipContext > .absolute) {
		position: absolute;
	}

	.trend-layer-chart :global(.trend-tooltip-root) {
		position: absolute;
		z-index: var(--z-tooltip);
		pointer-events: none;
		user-select: none;
	}

	.trend-layer-chart :global(.trend-tooltip-root[data-placement='above']) {
		transform: translate(-50%, calc(-100% - 0.75rem));
	}

	.trend-layer-chart :global(.trend-tooltip-root[data-placement='below']) {
		transform: translate(-50%, 0.75rem);
	}

	.trend-layer-chart :global(.trend-tooltip) {
		position: relative;
		box-sizing: border-box;
		width: 15rem;
		max-width: min(15rem, calc(100vw - 2rem));
		border: 0;
		border-radius: var(--radius-md);
		background: #141412;
		box-shadow: 0 10px 24px rgba(14, 14, 13, 0.24);
		padding: var(--sp-3);
		color: #f8f7f2;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.35;
	}

	.trend-layer-chart :global(.trend-tooltip)::after {
		content: '';
		position: absolute;
		left: 50%;
		width: 0.625rem;
		height: 0.625rem;
		background: #141412;
		transform: translateX(-50%) rotate(45deg);
	}

	.trend-layer-chart :global(.trend-tooltip-root[data-placement='above'] .trend-tooltip)::after {
		bottom: -0.3125rem;
	}

	.trend-layer-chart :global(.trend-tooltip-root[data-placement='below'] .trend-tooltip)::after {
		top: -0.3125rem;
	}

	.trend-layer-chart :global(.trend-tooltip-header) {
		margin: 0 0 var(--sp-2);
		padding-bottom: 0;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0;
		text-transform: uppercase;
		color: #f8f7f2;
	}

	.trend-layer-chart :global(.trend-tooltip-list) {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.trend-layer-chart :global(.trend-tooltip-row) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: var(--sp-2);
		align-items: center;
	}

	.trend-layer-chart :global(.trend-tooltip-label) {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
		color: #f8f7f2;
		white-space: nowrap;
	}

	.trend-layer-chart :global(.trend-tooltip-series-line) {
		display: block;
		flex: 0 0 auto;
		width: 1.5rem;
		height: 0.5rem;
		overflow: visible;
	}

	.trend-layer-chart :global(.trend-tooltip-value) {
		color: #f8f7f2;
		font-weight: var(--font-weight-semibold);
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}

	.trend-layer-chart :global(.trend-tooltip-count) {
		color: color-mix(in srgb, #f8f7f2 72%, transparent);
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}

	:root[data-theme='dark'] .trend-card {
		--trend-unit: var(--text-primary);
		--trend-2: #ed9d80;
		--trend-3: #9cc87b;
		--trend-4: #b8b0ff;
	}

	@media (prefers-reduced-motion: reduce) {
		.trend-layer-chart :global(.trend-line),
		.trend-layer-chart :global(.trend-hover-line),
		.trend-layer-chart :global(.trend-hover-point) {
			transition: none;
		}
	}

	@media (max-width: 640px) {
		.trend-card {
			padding: var(--sp-4);
		}

		.trend-card-header {
			align-items: start;
			flex-direction: column;
		}

		.trend-card h2 {
			font-size: 1.125rem;
		}

		.trend-layer-chart {
			height: 15.5rem;
		}

		.trend-layer-chart :global(.chart-axis-label) {
			font-size: 0.5625rem;
		}

		.chart-legend li {
			font-size: 0.5625rem;
		}
	}
</style>
