<script lang="ts">
	import { BarChart } from 'layerchart';
	import { buildReportCountTicks } from '$lib/components/charts/reportChartConventions';
	import ReportChartSection from '$lib/components/charts/ReportChartSection.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { IctExpirationCliff } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		cliff: IctExpirationCliff;
		currentReadinessPercent?: number | null;
		loading?: boolean;
	}

	interface CliffChartDatum {
		month: string;
		label: string;
		chartLabel: string;
		totalExpiringCount: number;
		values: Record<string, number>;
	}

	interface CliffTooltipEntry {
		key: string;
		label: string;
		color: string;
		count: number;
	}

	const TITLE_ID = 'ict-expiration-cliff-title';
	const DESCRIPTION_ID = 'ict-expiration-cliff-description';
	const TOOLTIP_WIDTH_PX = 220;
	const TOOLTIP_MARGIN_PX = 12;
	const EXPIRATION_SERIES_COLORS = [
		'#ba7517',
		'#993c1d',
		'#534ab7',
		'#5f5e5a',
		'#1d9e75',
		'#c18713',
		'#9d3d22',
		'#5b50b8',
		'#6f6d68',
		'#269b73'
	];

	let { cliff, currentReadinessPercent = null, loading = false }: Props = $props();

	const hasExpirations = $derived(cliff.months.some((month) => month.totalExpiringCount > 0));
	const projectionChangeText = $derived(
		formatProjectionChange(cliff.projectedReadinessAtMonth6.readinessPercent, currentReadinessPercent)
	);
	const chartData = $derived.by<CliffChartDatum[]>(() =>
		cliff.months.map((month) => ({
			month: month.month,
			label: month.label,
			chartLabel: (month.label.split(' ')[0] ?? month.label).toUpperCase(),
			totalExpiringCount: month.totalExpiringCount,
			values: Object.fromEntries(month.mosSegments.map((segment) => [segment.mos, segment.expiringCount]))
		}))
	);
	const yMax = $derived(Math.max(1, ...cliff.months.map((month) => month.totalExpiringCount)));
	const yTicks = $derived.by(() => buildReportCountTicks(yMax, { denseMax: 5 }));
	const chartSeries = $derived.by(() =>
		cliff.mosSeries.map((mos, index) => {
			const color = EXPIRATION_SERIES_COLORS[index % EXPIRATION_SERIES_COLORS.length];
			return {
				key: mos,
				label: mos,
				value: (datum: CliffChartDatum) => datum.values[mos] ?? 0,
				color,
				props: {
					class: 'expiration-bar',
					fill: color,
					stroke: 'var(--surface-panel)',
					strokeWidth: 1,
					radius: 0
				}
			};
		})
	);

	function formatCount(value: unknown): string {
		return String(Math.round(Number(value)));
	}

	function formatProjectionMonth(label: string): string {
		return label.toUpperCase();
	}

	function formatProjectionChange(projectedPercent: number, currentPercent: number | null): string | null {
		if (currentPercent === null) return null;

		const delta = projectedPercent - currentPercent;
		const points = Math.abs(delta);
		if (delta < 0) return `a ${points}-point drop from current`;
		if (delta > 0) return `a ${points}-point gain from current`;
		return 'no change from current';
	}

	function pluralizeTask(count: number): string {
		return count === 1 ? 'task' : 'tasks';
	}

	function tooltipCliffDatum(value: unknown): CliffChartDatum | null {
		if (!value || typeof value !== 'object') return null;
		const datum = value as Partial<CliffChartDatum>;
		if (typeof datum.label !== 'string' || typeof datum.totalExpiringCount !== 'number') return null;
		if (!datum.values || typeof datum.values !== 'object') return null;
		return datum as CliffChartDatum;
	}

	function tooltipEntries(datum: CliffChartDatum): CliffTooltipEntry[] {
		return chartSeries.map((series) => ({
			key: series.key,
			label: series.label,
			color: series.color,
			count: series.value(datum)
		}));
	}

	function hoveredTooltipEntry(
		datum: CliffChartDatum,
		pointerY: unknown,
		height: unknown,
		padding: { top?: number } | undefined
	): CliffTooltipEntry | null {
		const chartHeight = numericTooltipCoordinate(height);
		if (chartHeight <= 0) return null;

		const plotY = Math.min(Math.max(numericTooltipCoordinate(pointerY) - (padding?.top ?? 0), 0), chartHeight);
		const valueAtPointer = ((chartHeight - plotY) / chartHeight) * yMax;
		if (valueAtPointer > datum.totalExpiringCount) return null;

		let lowerBound = 0;
		for (const entry of tooltipEntries(datum)) {
			const upperBound = lowerBound + entry.count;
			if (entry.count > 0 && valueAtPointer >= lowerBound && valueAtPointer <= upperBound) {
				return entry;
			}
			lowerBound = upperBound;
		}

		return null;
	}

	function numericTooltipCoordinate(value: unknown): number {
		const numericValue = Number(value);
		return Number.isFinite(numericValue) ? numericValue : 0;
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

	function tooltipLeft(value: unknown, boundaryWidth: number): number {
		const x = numericTooltipCoordinate(value);
		const min = TOOLTIP_WIDTH_PX / 2 + TOOLTIP_MARGIN_PX;
		const max = Math.max(min, boundaryWidth - TOOLTIP_WIDTH_PX / 2 - TOOLTIP_MARGIN_PX);
		return Math.min(Math.max(x, min), max);
	}

	function tooltipTop(value: unknown, boundaryHeight: number): number {
		const y = numericTooltipCoordinate(value);
		const min = TOOLTIP_MARGIN_PX;
		const max = Math.max(min, boundaryHeight - TOOLTIP_MARGIN_PX);
		return Math.min(Math.max(y, min), max);
	}

	function tooltipPlacement(value: unknown): 'above' | 'below' {
		return numericTooltipCoordinate(value) < 120 ? 'below' : 'above';
	}
</script>

<ReportChartSection
	sectionClass="cliff-card"
	title="Expiration Cliff — Next 6 Months"
	titleId={TITLE_ID}
	description="Task completion expirations over the next six calendar months, stacked by MOS."
	descriptionId={DESCRIPTION_ID}
	kicker="Tasks lapsing by month"
	{loading}
>
	{#if !hasExpirations}
		<div class="empty-chart">
			<EmptyState message="No task completions expire in the next 6 months for the active filters." variant="simple" />
		</div>
	{:else}
		<div class="chart-canvas" role="img" aria-label="6-month expiration cliff chart" aria-describedby={DESCRIPTION_ID}>
			<div class="expiration-layer-chart" data-testid="layerchart-expiration-cliff">
				<span class="expiration-y-axis-title" aria-hidden="true">Tasks expiring</span>
				<BarChart
					data={chartData}
					x="chartLabel"
					yDomain={[0, yMax]}
					yNice={false}
					series={chartSeries}
					seriesLayout="stack"
					bandPadding={0.34}
					stackPadding={0.5}
					axis={true}
					grid={{
						x: false,
						y: { class: 'chart-grid-line' },
						yTicks
					}}
					rule={false}
					legend={false}
					labels={false}
					tooltip={{ mode: 'band', hideDelay: 40 }}
					padding={{ top: 16, right: 24, bottom: 50, left: 58 }}
					props={{
						highlight: {
							area: {
								fill: 'rgba(196, 127, 0, 0.08)',
								class: 'expiration-hover-band'
							}
						},
						svg: {
							class: 'expiration-layer-svg',
							label: '6-month expiration cliff chart',
							describedBy: DESCRIPTION_ID
						},
						xAxis: {
							tickLength: 0,
							tickLabelProps: {
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
							format: formatCount,
							tickLength: 4,
							tickLabelProps: {
								dx: -8,
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
					<svelte:fragment slot="tooltip" let:tooltip let:width let:height let:padding>
						{#if tooltip?.data}
							{@const tooltipDatum = tooltipCliffDatum(tooltip.data)}
							{#if tooltipDatum}
								{@const activeEntry = hoveredTooltipEntry(tooltipDatum, tooltip.y, height, padding)}
								{#if activeEntry}
									<div
										class="expiration-tooltip-root"
										data-placement={tooltipPlacement(tooltip.y)}
										style:left={`${tooltipLeft(tooltip.x, tooltipBoundary(width, padding, 'x'))}px`}
										style:top={`${tooltipTop(tooltip.y, tooltipBoundary(height, padding, 'y'))}px`}
									>
										<div class="expiration-tooltip" role="status" aria-live="polite">
											<div class="expiration-tooltip-header">{tooltipDatum.label}</div>
											<div class="expiration-tooltip-list">
												<div class="expiration-tooltip-row">
													<span class="expiration-tooltip-label">
														<span
															class="expiration-tooltip-swatch"
															style:--swatch-color={activeEntry.color}
															aria-hidden="true"
														></span>
														{activeEntry.label}
													</span>
													<strong class="expiration-tooltip-value">
														{activeEntry.count}
														{pluralizeTask(activeEntry.count)}
													</strong>
												</div>
											</div>
										</div>
									</div>
								{/if}
							{/if}
						{/if}
					</svelte:fragment>
				</BarChart>
			</div>

			<ul class="chart-legend" aria-label="Expiration cliff MOS series">
				{#each chartSeries as series (series.key)}
					<li>
						<span class="legend-swatch" style:--swatch-color={series.color} aria-hidden="true"></span>
						<span class="legend-label">{series.label}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if hasExpirations}
		<div class="projection-banner" aria-label="Projected unit readiness without retraining">
			<p>
				<span>Projected unit readiness without retraining:</span>
				<strong>
					{cliff.projectedReadinessAtMonth6.readinessPercent}% by {formatProjectionMonth(
						cliff.projectedReadinessAtMonth6.label
					)}
				</strong>
				{#if projectionChangeText}
					<span>- {projectionChangeText}.</span>
				{/if}
			</p>
		</div>
	{/if}

	<div class="fallback-table-scroll screen-reader-table">
		<table aria-label="6-month expiration cliff data">
			<thead>
				<tr>
					<th scope="col">Month</th>
					<th scope="col" class="numeric">Total expiring</th>
					{#each cliff.mosSeries as mos (mos)}
						<th scope="col" class="numeric">{mos} expiring</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each cliff.months as month (month.month)}
					<tr>
						<td>{month.label}</td>
						<td class="numeric">{month.totalExpiringCount}</td>
						{#each cliff.mosSeries as mos (mos)}
							<td class="numeric">
								{month.mosSegments.find((segment) => segment.mos === mos)?.expiringCount ?? 0}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</ReportChartSection>

<style>
	.chart-canvas {
		margin-top: 0;
	}

	.expiration-layer-chart {
		position: relative;
		height: 16.25rem;
		min-height: 15rem;
	}

	.expiration-y-axis-title {
		position: absolute;
		top: 50%;
		left: -1.35rem;
		z-index: 2;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
		transform: translateY(-50%) rotate(-90deg);
		white-space: nowrap;
		pointer-events: none;
	}

	.expiration-layer-chart :global(.layercake-container) {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.expiration-layer-chart :global(.layercake-layout-svg) {
		position: absolute;
		top: 0;
		left: 0;
		display: block;
		overflow: visible;
	}

	.expiration-layer-chart :global(.overflow-visible) {
		overflow: visible;
	}

	.expiration-layer-chart :global(.expiration-bar) {
		vector-effect: non-scaling-stroke;
	}

	.expiration-layer-chart :global(.expiration-hover-band) {
		pointer-events: none;
	}

	.expiration-layer-chart :global(.tooltip-rects rect),
	.expiration-layer-chart :global(.fill-transparent) {
		fill: transparent;
		stroke: none;
	}

	.expiration-layer-chart :global(.chart-axis-label) {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		fill: var(--text-secondary);
		opacity: 1;
		text-transform: uppercase;
	}

	.expiration-layer-chart :global(.chart-axis-rule),
	.expiration-layer-chart :global(.chart-axis-tick) {
		stroke: color-mix(in srgb, var(--border-default) 78%, transparent);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.expiration-layer-chart :global(.grid line),
	.expiration-layer-chart :global(.chart-grid-line) {
		stroke: var(--chart-grid-line);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.expiration-layer-chart :global(.TooltipContext) {
		position: absolute;
		z-index: 1;
		touch-action: none;
	}

	.expiration-layer-chart :global(.TooltipContext > .absolute) {
		position: absolute;
	}

	.expiration-layer-chart :global(.expiration-tooltip-root) {
		position: absolute;
		z-index: var(--z-tooltip);
		pointer-events: none;
		user-select: none;
	}

	.expiration-layer-chart :global(.expiration-tooltip-root[data-placement='above']) {
		transform: translate(-50%, calc(-100% - 0.75rem));
	}

	.expiration-layer-chart :global(.expiration-tooltip-root[data-placement='below']) {
		transform: translate(-50%, 0.75rem);
	}

	.expiration-layer-chart :global(.expiration-tooltip) {
		position: relative;
		box-sizing: border-box;
		width: 13.75rem;
		max-width: min(13.75rem, calc(100vw - 2rem));
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

	.expiration-layer-chart :global(.expiration-tooltip)::after {
		content: '';
		position: absolute;
		left: 50%;
		width: 0.625rem;
		height: 0.625rem;
		background: #141412;
		transform: translateX(-50%) rotate(45deg);
	}

	.expiration-layer-chart :global(.expiration-tooltip-root[data-placement='above'] .expiration-tooltip)::after {
		bottom: -0.3125rem;
	}

	.expiration-layer-chart :global(.expiration-tooltip-root[data-placement='below'] .expiration-tooltip)::after {
		top: -0.3125rem;
	}

	.expiration-layer-chart :global(.expiration-tooltip-header) {
		margin: 0 0 var(--sp-1);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0;
		text-transform: uppercase;
		color: #f8f7f2;
	}

	.expiration-layer-chart :global(.expiration-tooltip-list) {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.expiration-layer-chart :global(.expiration-tooltip-row) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--sp-3);
		align-items: center;
	}

	.expiration-layer-chart :global(.expiration-tooltip-label) {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
		color: #f8f7f2;
		white-space: nowrap;
	}

	.expiration-layer-chart :global(.expiration-tooltip-swatch) {
		display: block;
		flex: 0 0 auto;
		width: 0.625rem;
		height: 0.625rem;
		border: 0.5px solid color-mix(in srgb, #f8f7f2 46%, transparent);
		border-radius: 1px;
		background: var(--swatch-color);
	}

	.expiration-layer-chart :global(.expiration-tooltip-value) {
		color: #f8f7f2;
		font-weight: var(--font-weight-semibold);
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}

	.chart-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-3);
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

	.legend-swatch {
		display: block;
		width: 0.625rem;
		height: 0.625rem;
		border: 0.5px solid color-mix(in srgb, var(--text-primary) 40%, transparent);
		border-radius: 1px;
		background: var(--swatch-color);
	}

	.projection-banner {
		display: grid;
		grid-template-columns: 3px minmax(0, 1fr);
		align-items: stretch;
		margin-top: -2px;
		background: var(--surface-subtle);
	}

	.projection-banner::before {
		content: '';
		display: block;
		background: var(--amber-dark);
	}

	.projection-banner p {
		margin: 0;
		padding: 10px 14px;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-style: italic;
		line-height: 1.35;
		color: var(--text-primary);
	}

	.projection-banner strong {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-style: normal;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--danger);
	}

	.fallback-table-scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		min-width: 36rem;
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

	@media (max-width: 640px) {
		.expiration-layer-chart {
			height: 15.5rem;
		}

		.chart-legend li {
			font-size: 0.5625rem;
		}

		.projection-banner p {
			font-size: var(--text-sm);
		}
	}
</style>
