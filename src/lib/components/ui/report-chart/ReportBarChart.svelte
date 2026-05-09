<script lang="ts">
	import { BarChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import type { ChartConfig } from '$lib/components/ui/chart/index.js';
	import { cn } from '$lib/utils.js';

	export interface ReportBarChartDatum {
		label: string;
		[key: string]: number | string;
	}

	export interface ReportBarChartSeries {
		key: string;
		label: string;
		color: string;
	}

	interface Props {
		data: ReportBarChartDatum[];
		series: ReportBarChartSeries[];
		ariaLabel: string;
		yDomain?: [number, number];
		yTicks?: number[];
		layout?: 'group' | 'stack' | 'overlap';
		heightClass?: string;
		class?: string;
	}

	let {
		data,
		series,
		ariaLabel,
		yDomain,
		yTicks,
		layout = 'group',
		heightClass = 'min-h-[220px]',
		class: className
	}: Props = $props();

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
				fill: item.color,
				stroke: layout === 'overlap' ? item.color : 'var(--background)',
				strokeWidth: layout === 'overlap' ? 2 : 1,
				radius: 2
			}
		}))
	);

	function formatCount(value: unknown): string {
		return String(Math.round(Number(value)));
	}
</script>

<Chart.Container {config} class={cn(heightClass, 'w-full', className)}>
	<BarChart
		{data}
		x="label"
		{yDomain}
		yNice={!yDomain}
		series={chartSeries}
		seriesLayout={layout}
		bandPadding={layout === 'stack' ? 0.34 : 0.24}
		stackPadding={0.5}
		axis={true}
		grid={{
			x: false,
			y: { class: 'stroke-border/60' },
			yTicks
		}}
		rule={false}
		legend={false}
		labels={false}
		tooltip={false}
		padding={{ top: 16, right: 20, bottom: 42, left: 46 }}
		props={{
			svg: {
				label: ariaLabel
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
				format: formatCount,
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
			<span class="size-2.5 rounded-[2px]" style:background={item.color} aria-hidden="true"></span>
			<span>{item.label}</span>
		</li>
	{/each}
</ul>
