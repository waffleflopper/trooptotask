<script lang="ts">
	import { BarChart } from 'layerchart';
	import { REPORT_CHART_SERIES } from '$lib/components/charts/reportChartConventions';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { IctExpirationCliff } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		cliff: IctExpirationCliff;
		loading?: boolean;
	}

	interface CliffChartDatum {
		month: string;
		label: string;
		chartLabel: string;
		totalExpiringCount: number;
		values: Record<string, number>;
	}

	const TITLE_ID = 'ict-expiration-cliff-title';
	const DESCRIPTION_ID = 'ict-expiration-cliff-description';

	let { cliff, loading = false }: Props = $props();

	const hasExpirations = $derived(cliff.months.some((month) => month.totalExpiringCount > 0));
	const chartData = $derived.by<CliffChartDatum[]>(() =>
		cliff.months.map((month) => ({
			month: month.month,
			label: month.label,
			chartLabel: month.label.split(' ')[0] ?? month.label,
			totalExpiringCount: month.totalExpiringCount,
			values: Object.fromEntries(month.mosSegments.map((segment) => [segment.mos, segment.expiringCount]))
		}))
	);
	const yMax = $derived(Math.max(1, ...cliff.months.map((month) => month.totalExpiringCount)));
	const yTicks = $derived.by(() => buildCountTicks(yMax));
	const chartSeries = $derived.by(() =>
		cliff.mosSeries.map((mos, index) => {
			const convention = REPORT_CHART_SERIES[index % REPORT_CHART_SERIES.length];
			return {
				key: mos,
				label: mos,
				value: (datum: CliffChartDatum) => datum.values[mos] ?? 0,
				color: convention.color,
				props: {
					class: 'expiration-bar',
					stroke: 'var(--surface-panel)',
					strokeWidth: 1,
					radius: 0
				}
			};
		})
	);

	function buildCountTicks(maxValue: number): number[] {
		if (maxValue <= 5) {
			return Array.from({ length: maxValue + 1 }, (_, index) => index);
		}

		const step = Math.ceil(maxValue / 4);
		const ticks = Array.from({ length: 5 }, (_, index) => index * step);
		return ticks.at(-1) === maxValue ? ticks : [...ticks.filter((tick) => tick < maxValue), maxValue];
	}

	function formatCount(value: unknown): string {
		return String(Math.round(Number(value)));
	}
</script>

<section
	class="cliff-card"
	aria-labelledby={TITLE_ID}
	aria-describedby={DESCRIPTION_ID}
	aria-busy={loading ? 'true' : 'false'}
>
	<div class="cliff-card-header">
		<div>
			<h2 id={TITLE_ID}>Expiration Cliff - 6 Months</h2>
			<p id={DESCRIPTION_ID} class="screen-reader-text">
				Task completion expirations over the next six calendar months, stacked by MOS.
			</p>
		</div>
		{#if loading}
			<span class="chart-status">Updating</span>
		{/if}
	</div>

	<div class="projection-summary" aria-label="Projected unit readiness at month 6">
		<span>Projected readiness at {cliff.projectedReadinessAtMonth6.label}</span>
		<strong>{cliff.projectedReadinessAtMonth6.readinessPercent}%</strong>
		<small>
			{cliff.projectedReadinessAtMonth6.readyCount} of {cliff.projectedReadinessAtMonth6.applicableCount} requirements still
			current
		</small>
	</div>

	{#if !hasExpirations}
		<div class="empty-chart">
			<EmptyState message="No task completions expire in the next 6 months for the active filters." variant="simple" />
		</div>
	{:else}
		<div class="chart-canvas" role="img" aria-label="6-month expiration cliff chart" aria-describedby={DESCRIPTION_ID}>
			<div class="expiration-layer-chart" data-testid="layerchart-expiration-cliff">
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
					tooltip={false}
					padding={{ top: 16, right: 24, bottom: 50, left: 58 }}
					props={{
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
				/>
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
	{/if}
</section>

<style>
	.cliff-card {
		--trend-unit: #1f9970;
		--trend-1: var(--amber-dark);
		--trend-2: #6255c7;
		--trend-3: #9a3f28;
		--trend-4: var(--info);
		--chart-grid-line: color-mix(in srgb, var(--border-default) 42%, transparent);

		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		border: 0.5px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		padding: var(--sp-5) var(--sp-6) var(--sp-4);
	}

	.cliff-card-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-3);
		border-bottom: 0.5px solid var(--border-default);
		padding-bottom: var(--sp-2);
	}

	.cliff-card h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: var(--font-weight-semibold);
		line-height: 1;
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.chart-status {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.projection-summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--sp-1) var(--sp-3);
		align-items: baseline;
	}

	.projection-summary span,
	.projection-summary small {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.projection-summary strong {
		grid-row: span 2;
		font-family: var(--font-display);
		font-size: var(--text-4xl);
		font-weight: var(--font-weight-semibold);
		line-height: 0.95;
		color: var(--text-primary);
	}

	.chart-canvas {
		margin-top: 0;
	}

	.expiration-layer-chart {
		position: relative;
		height: 18rem;
		min-height: 16rem;
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

	.expiration-layer-chart :global(.chart-axis-label) {
		font-family: var(--font-body);
		font-size: 15px;
		letter-spacing: 0;
		fill: var(--text-secondary);
		opacity: 1;
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

	.chart-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-4);
		margin: var(--sp-2) 0 0;
		padding: 0;
		list-style: none;
	}

	.chart-legend li {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-base);
		letter-spacing: 0;
		color: var(--text-primary);
	}

	.legend-swatch {
		display: block;
		width: 1rem;
		height: 1rem;
		border: 0.5px solid color-mix(in srgb, var(--text-primary) 40%, transparent);
		border-radius: 1px;
		background: var(--swatch-color);
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

	:root[data-theme='dark'] .cliff-card {
		--trend-unit: #60c89f;
		--trend-2: #b8b0ff;
		--trend-3: #ed9d80;
	}

	@media (max-width: 640px) {
		.cliff-card {
			padding: var(--sp-4);
		}

		.cliff-card h2 {
			font-size: var(--text-2xl);
		}

		.projection-summary {
			grid-template-columns: 1fr;
		}

		.projection-summary strong {
			grid-row: auto;
			font-size: var(--text-3xl);
		}

		.expiration-layer-chart {
			height: 16rem;
		}

		.chart-legend li {
			font-size: var(--text-sm);
		}
	}
</style>
