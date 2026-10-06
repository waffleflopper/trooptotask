<script lang="ts" module>
	const WIDTH = 630;
	const HEIGHT = 200;
	const LEFT = 36;
	const RIGHT = 598;
	const LINE_TOP = 26;
	const LINE_BOTTOM = 124;
	const BAR_BASE = 176;
	const BAR_MAX = 32;
	const TICK_Y = 190;
	const TICK_CHAR_PX = 9 * 0.6;
	const TICK_GAP = 10;

	function utcMs(date: string): number {
		return Date.parse(`${date}T00:00:00Z`);
	}
</script>

<script lang="ts">
	import { buildReportCountTicks, readinessTrendDomain } from '$lib/components/charts/reportChartConventions';
	import type { BriefingForecast } from '../utils/trainingBriefing.types';

	interface Props {
		forecast: BriefingForecast;
		ariaLabel: string;
	}

	let { forecast, ariaLabel }: Props = $props();

	const percents = $derived(forecast.points.map((point) => point.percent ?? 0));
	const domain = $derived(readinessTrendDomain([...percents, forecast.goalPercent]) ?? [0, 100]);
	const yTicks = $derived.by(() => {
		const [min, max] = domain;
		const step = min === 50 ? 10 : 20;
		return Array.from({ length: (max - min) / step + 1 }, (_, index) => min + index * step);
	});
	const start = $derived(utcMs(forecast.points[0].date));
	const span = $derived(Math.max(1, utcMs(forecast.points[forecast.points.length - 1].date) - start));
	const countTop = $derived(
		buildReportCountTicks(Math.max(0, ...forecast.buckets.map((bucket) => bucket.lapses))).at(-1) ?? 0
	);

	function x(date: string): number {
		return LEFT + ((utcMs(date) - start) / span) * (RIGHT - LEFT);
	}

	function y(percent: number): number {
		const [min, max] = domain;
		return LINE_BOTTOM - ((percent - min) / (max - min)) * (LINE_BOTTOM - LINE_TOP);
	}

	const line = $derived(
		forecast.points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.date)},${y(percents[index])}`).join(' ')
	);
	const bars = $derived(
		forecast.buckets.map((bucket, index) => {
			const x0 = x(forecast.points[index].date);
			const x1 = x(bucket.endDate);
			const height = countTop === 0 ? 0 : (bucket.lapses / countTop) * BAR_MAX;
			return {
				key: bucket.endDate,
				x: x0 + (x1 - x0) * 0.12,
				width: (x1 - x0) * 0.76,
				height,
				lapses: bucket.lapses,
				emphasized: bucket.inCliff
			};
		})
	);
	const band = $derived.by(() => {
		const cliff = forecast.cliff;
		const firstInCliff = forecast.buckets.findIndex((bucket) => bucket.inCliff);
		if (!cliff?.highlighted || firstInCliff === -1) return null;
		const left = x(forecast.points[firstInCliff].date);
		const right = x(cliff.endDate);
		const alignEnd = (left - LEFT) / (RIGHT - LEFT) > 0.6;
		return {
			x: left,
			width: right - left,
			labelX: alignEnd ? right : left + 4,
			anchor: alignEnd ? ('end' as const) : ('start' as const),
			label: `${cliff.label} · ${cliff.lapses} ${cliff.lapses === 1 ? 'lapse' : 'lapses'}`
		};
	});
	const ticks = $derived.by(() => {
		const placed = forecast.axisTicks.map((tick, index, all) => {
			const anchor = index === 0 ? 'start' : index === all.length - 1 ? 'end' : 'middle';
			const width = tick.label.length * TICK_CHAR_PX;
			const at = x(tick.date);
			const left = anchor === 'start' ? at : anchor === 'end' ? at - width : at - width / 2;
			return { ...tick, x: at, anchor: anchor as 'start' | 'middle' | 'end', left, right: left + width };
		});
		const end = placed.pop();
		if (!end) return placed;
		const kept = placed.slice(0, 1);
		for (const tick of placed.slice(1)) {
			if (tick.left >= kept[kept.length - 1].right + TICK_GAP && tick.right + TICK_GAP <= end.left) kept.push(tick);
		}
		return [...kept, end];
	});
	const first = $derived({ x: x(forecast.points[0].date), y: y(percents[0]), percent: percents[0] });
	const last = $derived({
		x: x(forecast.points[forecast.points.length - 1].date),
		y: y(percents[percents.length - 1]),
		percent: percents[percents.length - 1]
	});
</script>

<svg
	viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
	class="block h-auto w-full overflow-visible font-mono"
	role="img"
	aria-label={ariaLabel}
	data-slot="training-print-forecast"
>
	{#if band}
		<rect x={band.x} y={8} width={band.width} height={BAR_BASE - 8} class="fill-(--training-print-band)" />
		<text
			x={band.labelX}
			y={18}
			text-anchor={band.anchor}
			class="fill-foreground text-[9px] font-semibold uppercase tracking-[0.04em]">{band.label}</text
		>
	{/if}
	{#each yTicks as tick (tick)}
		<line x1={LEFT} x2={RIGHT} y1={y(tick)} y2={y(tick)} class="stroke-border" stroke-width="0.75" />
		<text x={LEFT - 6} y={y(tick) + 3} text-anchor="end" class="fill-muted-foreground text-[9px]">{tick}%</text>
	{/each}
	<line
		x1={LEFT}
		x2={RIGHT}
		y1={y(forecast.goalPercent)}
		y2={y(forecast.goalPercent)}
		class="stroke-foreground"
		stroke-dasharray="4 3"
	/>
	<text x={LEFT + 8} y={y(forecast.goalPercent) + 12} class="fill-foreground text-[9px]"
		>Goal {forecast.goalPercent}%</text
	>
	<path d={line} fill="none" class="stroke-foreground" stroke-width="1.75" />
	<circle cx={first.x} cy={first.y} r="3" class="fill-foreground" />
	<text x={first.x + 6} y={first.y - 6} class="fill-foreground text-[10px] font-semibold">{first.percent}%</text>
	<circle cx={last.x} cy={last.y} r="3" class="fill-foreground" />
	<text x={last.x + 5} y={last.y - 6} class="fill-foreground text-[10px] font-semibold">{last.percent}%</text>
	{#each bars as bar (bar.key)}
		<rect
			x={bar.x}
			y={BAR_BASE - bar.height}
			width={bar.width}
			height={bar.height}
			class={bar.emphasized ? 'fill-foreground' : 'fill-(--training-print-bar)'}
		/>
		{#if bar.lapses > 0}
			<text
				x={bar.x + bar.width / 2}
				y={BAR_BASE - bar.height - 3}
				text-anchor="middle"
				class="fill-foreground text-[8.5px]">{bar.lapses}</text
			>
		{/if}
	{/each}
	<line x1={LEFT} x2={RIGHT} y1={BAR_BASE} y2={BAR_BASE} class="stroke-foreground" stroke-width="0.75" />
	<text x={LEFT - 6} y={BAR_BASE - 12} text-anchor="end" class="fill-muted-foreground text-[8.5px]">lapses</text>
	<text x={LEFT - 6} y={BAR_BASE - 2} text-anchor="end" class="fill-muted-foreground text-[8.5px]">/ wk</text>
	{#each ticks as tick (tick.date)}
		<text x={tick.x} y={TICK_Y} text-anchor={tick.anchor} class="fill-muted-foreground text-[9px]">{tick.label}</text>
	{/each}
</svg>
