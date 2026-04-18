<script lang="ts">
	import { BarChart } from 'layerchart';
	import { REPORT_CHART_SERIES, buildReportCountTicks } from '$lib/components/charts/reportChartConventions';
	import ReportChartSection from '$lib/components/charts/ReportChartSection.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { IctReadinessDistribution } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		distribution: IctReadinessDistribution;
		selectedPageMos?: string[];
		loading?: boolean;
	}

	interface DistributionChartDatum {
		key: string;
		label: string;
		values: Record<string, number>;
	}

	const TITLE_ID = 'ict-readiness-distribution-title';
	const DESCRIPTION_ID = 'ict-readiness-distribution-description';
	const CONTROL_ID = 'ict-readiness-distribution-mos';

	let { distribution, selectedPageMos = [], loading = false }: Props = $props();
	let selectedMos = $state<string | null>(null);

	const overlayMode = $derived(selectedPageMos.length >= 2);
	const selectedHistogramMos = $derived(selectedMos ?? distribution.defaultMos ?? '');
	const activeSeries = $derived.by(() => {
		if (overlayMode) {
			const selectedMosSet = new Set(selectedPageMos);
			return distribution.series.filter((series) => selectedMosSet.has(series.mos));
		}

		return distribution.series.filter((series) => series.mos === selectedHistogramMos);
	});
	const hasDistribution = $derived(activeSeries.length > 0);
	const chartData = $derived.by<DistributionChartDatum[]>(() =>
		distribution.bins.map((bin) => ({
			key: bin.key,
			label: bin.label,
			values: Object.fromEntries(
				activeSeries.map((series) => [
					series.mos,
					series.bins.find((seriesBin) => seriesBin.key === bin.key)?.soldierCount ?? 0
				])
			)
		}))
	);
	const yMax = $derived(Math.max(1, ...activeSeries.flatMap((series) => series.bins.map((bin) => bin.soldierCount))));
	const yTicks = $derived.by(() => buildReportCountTicks(yMax, { denseMax: 4 }));
	const chartSeries = $derived.by(() =>
		activeSeries.map((series, index) => {
			const convention = REPORT_CHART_SERIES[index % REPORT_CHART_SERIES.length];
			return {
				key: series.mos,
				label: series.mos,
				personnelCount: series.personnelCount,
				value: (datum: DistributionChartDatum) => datum.values[series.mos] ?? 0,
				color: convention.color,
				props: {
					class: `distribution-bar ${convention.className}`,
					fill: convention.color,
					stroke: convention.color,
					strokeWidth: 2,
					radius: 0
				}
			};
		})
	);

	$effect(() => {
		if (overlayMode) {
			return;
		}

		const pageMos = selectedPageMos.length === 1 ? selectedPageMos[0] : null;
		if (pageMos && distribution.series.some((series) => series.mos === pageMos)) {
			selectedMos = pageMos;
			return;
		}

		if (!distribution.series.some((series) => series.mos === selectedHistogramMos)) {
			selectedMos = null;
		}
	});

	function formatCount(value: unknown): string {
		return String(Math.round(Number(value)));
	}

	function pluralizeSoldier(count: number): string {
		return count === 1 ? 'Soldier' : 'Soldiers';
	}

	function selectedSeriesCount(series: { personnelCount: number }): string {
		return `${series.personnelCount} ${pluralizeSoldier(series.personnelCount)}`;
	}
</script>

<ReportChartSection
	sectionClass="distribution-card"
	title="Distribution — Individual Readiness by MOS"
	titleId={TITLE_ID}
	description="Soldiers grouped by individual readiness percentage for the selected MOS context."
	descriptionId={DESCRIPTION_ID}
	kicker="Soldiers by readiness band"
	{loading}
>
	<div class="distribution-toolbar">
		<p>Soldiers grouped by individual readiness percentage.</p>
		{#if overlayMode}
			<span class="overlay-note">Overlaying selected MOS filters.</span>
		{:else if distribution.series.length > 1}
			<div class="histogram-select-field">
				<label class="histogram-select-label" for={CONTROL_ID}>Histogram MOS</label>
				<select
					id={CONTROL_ID}
					value={selectedHistogramMos}
					disabled={loading}
					onchange={(event) => (selectedMos = event.currentTarget.value)}
				>
					{#each distribution.series as series (series.mos)}
						<option value={series.mos}>{series.mos} ({selectedSeriesCount(series)})</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	{#if !hasDistribution}
		<div class="empty-chart">
			<EmptyState message="No Soldiers are available for the selected MOS/filter context." variant="simple" />
		</div>
	{:else}
		<div
			class="chart-canvas"
			role="img"
			aria-label="Individual readiness distribution histogram"
			aria-describedby={DESCRIPTION_ID}
		>
			<div class="distribution-layer-chart" data-testid="layerchart-readiness-distribution">
				<span class="distribution-y-axis-title" aria-hidden="true">Soldiers</span>
				<BarChart
					data={chartData}
					x="label"
					yDomain={[0, yMax]}
					yNice={false}
					series={chartSeries}
					seriesLayout="overlap"
					bandPadding={0.28}
					axis={true}
					grid={{
						x: false,
						y: { class: 'chart-grid-line' },
						yTicks
					}}
					rule={false}
					legend={false}
					labels={false}
					tooltip={false}
					padding={{ top: 16, right: 24, bottom: 50, left: 58 }}
					props={{
						svg: {
							class: 'distribution-layer-svg',
							label: 'Individual readiness distribution histogram',
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
				/>
			</div>

			<ul class="chart-legend" aria-label="Readiness distribution MOS series">
				{#each chartSeries as series (series.key)}
					<li aria-label={`${series.label}, ${selectedSeriesCount(series)}`}>
						<svg class="legend-bar" viewBox="0 0 24 12" aria-hidden="true">
							<rect
								class={series.props.class}
								x="1"
								y="2"
								width="22"
								height="8"
								fill={series.color}
								stroke={series.color}
								stroke-width={series.props.strokeWidth}
							/>
						</svg>
						<span class="legend-label">{series.label}</span>
						<span class="legend-count">{selectedSeriesCount(series)}</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="fallback-table-scroll screen-reader-table">
			<table aria-label="Individual readiness distribution data">
				<thead>
					<tr>
						<th scope="col">Readiness band</th>
						{#each activeSeries as series (series.mos)}
							<th scope="col" class="numeric">{series.mos} Soldiers</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each distribution.bins as bin (bin.key)}
						<tr>
							<td>{bin.label}</td>
							{#each activeSeries as series (series.mos)}
								<td class="numeric">
									{series.bins.find((seriesBin) => seriesBin.key === bin.key)?.soldierCount ?? 0}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</ReportChartSection>

<style>
	.overlay-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.distribution-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}

	.distribution-toolbar p {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.histogram-select-field {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
	}

	.histogram-select-label {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	select {
		min-width: 11rem;
		min-height: 2.125rem;
		border: 1px solid color-mix(in srgb, var(--border-default) 82%, var(--text-primary) 18%);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		padding: 0 var(--sp-3);
		color: var(--text-primary);
		font: inherit;
	}

	.chart-canvas {
		margin-top: 0;
	}

	.distribution-layer-chart {
		position: relative;
		height: 16.25rem;
		min-height: 15rem;
	}

	.distribution-y-axis-title {
		position: absolute;
		top: 50%;
		left: -1.15rem;
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

	.distribution-layer-chart :global(.layercake-container) {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.distribution-layer-chart :global(.layercake-layout-svg) {
		position: absolute;
		top: 0;
		left: 0;
		display: block;
		overflow: visible;
	}

	.distribution-layer-chart :global(.overflow-visible) {
		overflow: visible;
	}

	.distribution-layer-chart :global(.distribution-bar) {
		fill-opacity: 0.56;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	.distribution-layer-chart :global(.chart-axis-label) {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		fill: var(--text-secondary);
		opacity: 1;
		text-transform: uppercase;
	}

	.distribution-layer-chart :global(.chart-axis-rule),
	.distribution-layer-chart :global(.chart-axis-tick) {
		stroke: color-mix(in srgb, var(--border-default) 78%, transparent);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.distribution-layer-chart :global(.grid line),
	.distribution-layer-chart :global(.chart-grid-line) {
		stroke: var(--chart-grid-line);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.distribution-layer-chart :global(.tooltip-rects rect),
	.distribution-layer-chart :global(.fill-transparent) {
		fill: transparent;
		stroke: none;
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

	.legend-bar {
		display: block;
		flex: 0 0 auto;
		width: 1.125rem;
		height: 0.6rem;
		overflow: visible;
	}

	.legend-bar .distribution-bar {
		fill-opacity: 0.56;
	}

	.legend-count {
		color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
	}

	.report-chart-line-solid,
	.distribution-layer-chart :global(.report-chart-line-solid) {
		stroke-dasharray: none;
	}

	.report-chart-line-short-dash,
	.distribution-layer-chart :global(.report-chart-line-short-dash) {
		stroke-dasharray: 7 5;
	}

	.report-chart-line-long-dash,
	.distribution-layer-chart :global(.report-chart-line-long-dash) {
		stroke-dasharray: 13 6;
	}

	.report-chart-line-dot-dash,
	.distribution-layer-chart :global(.report-chart-line-dot-dash) {
		stroke-dasharray: 2 5 9 5;
	}

	.report-chart-line-dotted,
	.distribution-layer-chart :global(.report-chart-line-dotted) {
		stroke-dasharray: 2 5;
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

	@media (max-width: 720px) {
		.distribution-toolbar {
			align-items: flex-start;
			flex-direction: column;
		}

		.histogram-select-field,
		select {
			width: 100%;
		}
	}
</style>
