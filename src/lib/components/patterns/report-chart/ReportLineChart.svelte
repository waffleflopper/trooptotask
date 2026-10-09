<script lang="ts">
	import { scalePoint } from 'd3-scale';
	import { LineChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import type { ChartConfig } from '$lib/components/ui/chart/index.js';
	import { cn } from '$lib/utils.js';

	export interface ReportLineChartDatum {
		label: string;
		[key: string]: number | string;
	}

	export interface ReportLineChartSeries {
		key: string;
		label: string;
		color: string;
		strokeWidth?: number;
	}

	interface Props {
		data: ReportLineChartDatum[];
		series: ReportLineChartSeries[];
		ariaLabel: string;
		yDomain?: [number, number];
		yTicks?: number[];
		heightClass?: string;
		class?: string;
	}

	let { data, series, ariaLabel, yDomain, yTicks, heightClass = 'h-[220px]', class: className }: Props = $props();

	const config = $derived.by<ChartConfig>(() =>
		Object.fromEntries(
			series.map((item) => [
				item.key,
				{
					label: item.label,
					color: item.color
				}
			])
		)
	);

	const chartSeries = $derived.by(() =>
		series.map((item) => ({
			key: item.key,
			label: item.label,
			value: item.key,
			color: item.color,
			props: {
				stroke: item.color,
				strokeWidth: item.strokeWidth ?? 2
			}
		}))
	);
	const xDomain = $derived(data.map((item) => item.label));

	function formatPercent(value: unknown): string {
		return `${Math.round(Number(value))}%`;
	}
</script>

<Chart.Container {config} class={cn('aspect-auto w-full', heightClass, className)}>
	<LineChart
		{data}
		x="label"
		{xDomain}
		xScale={scalePoint()}
		{yDomain}
		yNice={!yDomain}
		series={chartSeries}
		axis={true}
		grid={{
			x: false,
			y: { class: 'stroke-border/60' },
			yTicks
		}}
		rule={false}
		legend={false}
		points={false}
		tooltip={false}
		padding={{ top: 16, right: 20, bottom: 42, left: 48 }}
		props={{
			svg: {
				label: ariaLabel
			},
			spline: {
				fill: 'none'
			},
			xAxis: {
				tickLength: 0,
				tickLabelProps: {
					fill: 'var(--muted-foreground)',
					stroke: 'none',
					class: 'text-[10px]'
				}
			},
			yAxis: {
				ticks: yTicks,
				format: formatPercent,
				tickLength: 0,
				tickLabelProps: {
					dx: -8,
					textAnchor: 'end',
					verticalAnchor: 'middle',
					fill: 'var(--muted-foreground)',
					stroke: 'none',
					class: 'text-[10px]'
				}
			}
		}}
	/>
</Chart.Container>

<ul
	class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
	aria-label={`${ariaLabel} series`}
>
	{#each series as item (item.key)}
		<li class="inline-flex items-center gap-1.5">
			<span class="h-0.5 w-5 rounded-full" style:background={item.color} aria-hidden="true"></span>
			<span>{item.label}</span>
		</li>
	{/each}
</ul>
