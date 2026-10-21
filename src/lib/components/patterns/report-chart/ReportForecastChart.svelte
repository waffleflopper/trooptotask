<script lang="ts">
	import { Area, Axis, Chart, Circle, Rect, Rule, Spline, Svg, Text } from 'layerchart';
	import * as ChartUi from '$lib/components/ui/chart/index.js';
	import ReportChartTable from './ReportChartTable.svelte';
	import { buildReportCountTicks, readinessTrendDomain } from './reportChartConventions';
	import { cn } from '$lib/utils.js';

	export interface ReportForecastPoint {
		date: string;
		label: string;
		percent: number;
	}

	/** Lapses between two consecutive points; `emphasized` bars sit inside the highlighted band. */
	export interface ReportForecastBar {
		start: string;
		end: string;
		count: number;
		emphasized: boolean;
	}

	export interface ReportForecastBand {
		start: string;
		end: string;
		label: string;
		caption: string;
	}

	interface Props {
		points: ReportForecastPoint[];
		bars: ReportForecastBar[];
		goal: { value: number; label: string };
		band: ReportForecastBand | null;
		xTicks: Array<{ date: string; label: string }>;
		endTone: string;
		ariaLabel: string;
		heightClass?: string;
		class?: string;
	}

	let {
		points,
		bars,
		goal,
		band,
		xTicks,
		endTone,
		ariaLabel,
		heightClass = 'h-[312px]',
		class: className
	}: Props = $props();

	const LINE_TOP = 24;
	const END_LABEL_ROW = 28;
	const BAR_LABEL_ROW = 16;
	const BAR_SHARE = 0.24;
	const TICK_FONT_PX = 11;
	const LABEL_GAP = 8;
	const END_DOT_RADIUS = 5;
	const GOAL_LABEL_OFFSET = END_DOT_RADIUS + LABEL_GAP;
	const VALUE_CAP_PX = 12 * 0.7;
	const RULE_CLEARANCE = 2.5;

	interface Span {
		left: number;
		right: number;
	}

	function estimatedTextWidth(text: string, fontPx: number): number {
		return text.length * fontPx * 0.6;
	}

	function anchoredSpan(x: number, width: number, anchor: 'start' | 'middle' | 'end'): Span {
		const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
		return { left, right: left + width };
	}

	function clears(a: Span, b: Span): boolean {
		return b.left >= a.right + LABEL_GAP;
	}

	/**
	 * Distance from a point to the nearest glyph edge of its value label, moved past any
	 * horizontal rule the glyphs would otherwise strike. `direction` is -1 above, 1 below.
	 */
	function valueLabelOffset(pointY: number, direction: 1 | -1, ruleYs: number[], minOffset: number): number {
		let offset = minOffset;
		for (const distance of ruleYs.map((y) => (y - pointY) * direction).sort((a, b) => a - b)) {
			if (distance > offset + VALUE_CAP_PX + RULE_CLEARANCE) break;
			if (distance >= offset - RULE_CLEARANCE) offset = distance + RULE_CLEARANCE;
		}
		return offset;
	}

	function barTop(height: number): number {
		return height * (1 - BAR_SHARE);
	}

	function lineFloor(height: number): number {
		return barTop(height) - BAR_LABEL_ROW - END_LABEL_ROW;
	}

	function utcMidnightMs(date: string): number {
		return Date.parse(`${date}T00:00:00Z`);
	}

	const padding = $derived({
		top: 12,
		right: GOAL_LABEL_OFFSET + estimatedTextWidth(goal.label, TICK_FONT_PX) + 4,
		bottom: 28,
		left: 40
	});
	const data = $derived(points.map((point) => ({ date: utcMidnightMs(point.date), percent: point.percent })));
	const xDomain = $derived([utcMidnightMs(points[0].date), utcMidnightMs(points[points.length - 1].date)]);
	const yDomain = $derived(readinessTrendDomain([...points.map((point) => point.percent), goal.value]) ?? [0, 100]);
	const yTicks = $derived.by(() => {
		const [min, max] = yDomain;
		const step = min === 50 ? 10 : 20;
		return Array.from({ length: (max - min) / step + 1 }, (_, index) => min + index * step);
	});
	const bandEdges = $derived.by(() => {
		if (!band) return null;
		const span = xDomain[1] - xDomain[0];
		const start = (utcMidnightMs(band.start) - xDomain[0]) / span;
		const end = (utcMidnightMs(band.end) - xDomain[0]) / span;
		return { start, end, alignEnd: start + end > 1 };
	});
	const maxCount = $derived(Math.max(...bars.map((bar) => bar.count), 0));
	const countTop = $derived(buildReportCountTicks(maxCount).at(-1) ?? 0);
	const first = $derived(points[0]);
	const last = $derived(points[points.length - 1]);
	const tableRows = $derived(
		points.map((point, index) => {
			const bar = index === 0 ? null : (bars[index - 1] ?? null);
			return {
				key: point.label,
				cells: [
					point.label,
					`${point.percent}%`,
					index === 0 ? '—' : (bar?.count ?? 0),
					index === 0 ? '—' : bar?.emphasized ? 'Yes' : 'No'
				]
			};
		})
	);

	function axisLabels(xScale: (date: number) => number) {
		const labels = xTicks.map((tick, index) => {
			const anchor: 'start' | 'middle' | 'end' = index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle';
			const x = xScale(utcMidnightMs(tick.date));
			return { ...tick, x, anchor, ...anchoredSpan(x, estimatedTextWidth(tick.label, TICK_FONT_PX), anchor) };
		});
		const [start, ...rest] = labels;
		const end = rest.pop();
		if (!start || !end) return labels;
		const kept = [start];
		for (const label of rest) {
			if (clears(kept[kept.length - 1], label) && clears(label, end)) kept.push(label);
		}
		return [...kept, end];
	}

	function barGeometry(bar: ReportForecastBar, xScale: (date: number) => number, height: number) {
		const x0 = xScale(utcMidnightMs(bar.start));
		const x1 = xScale(utcMidnightMs(bar.end));
		const barHeight = countTop === 0 ? 0 : (bar.count / countTop) * (height - barTop(height));
		return { x: x0 + (x1 - x0) * 0.15, width: (x1 - x0) * 0.7, y: height - barHeight, height: barHeight };
	}

	function barLabels(xScale: (date: number) => number, height: number) {
		const labels: Array<Span & { key: string; value: string; x: number; y: number }> = [];
		for (const bar of bars) {
			if (!bar.emphasized || bar.count === 0) continue;
			const box = barGeometry(bar, xScale, height);
			const value = String(bar.count);
			const x = box.x + box.width / 2;
			const label = {
				key: bar.end,
				value,
				x,
				y: box.y - 4,
				...anchoredSpan(x, estimatedTextWidth(value, TICK_FONT_PX), 'middle')
			};
			const previous = labels[labels.length - 1];
			if (!previous || clears(previous, label)) labels.push(label);
		}
		return labels;
	}

	function bandGeometry(value: ReportForecastBand, xScale: (date: number) => number) {
		const x = xScale(utcMidnightMs(value.start));
		return { x, width: xScale(utcMidnightMs(value.end)) - x };
	}
</script>

<div class={cn('w-full', className)}>
	{#if band && bandEdges}
		<div
			class="mb-1 text-foreground"
			class:text-right={bandEdges.alignEnd}
			style:padding-left={bandEdges.alignEnd
				? undefined
				: `calc(${padding.left}px + (100% - ${padding.left + padding.right}px) * ${bandEdges.start})`}
			style:padding-right={bandEdges.alignEnd
				? `calc(${padding.right}px + (100% - ${padding.left + padding.right}px) * ${1 - bandEdges.end})`
				: undefined}
		>
			<p class="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">{band.label}</p>
			<p class="font-serif text-[13px] leading-tight">{band.caption}</p>
		</div>
	{/if}
	<ChartUi.Container config={{}} class={cn('aspect-auto w-full', heightClass)} aria-hidden="true">
		<Chart
			{data}
			x="date"
			y="percent"
			{xDomain}
			{yDomain}
			yRange={({ height }: { height: number }) => [lineFloor(height), LINE_TOP]}
			{padding}
			let:width
			let:height
			let:xScale
			let:yScale
		>
			{@const bandBox = band ? bandGeometry(band, xScale) : null}
			{@const firstX = xScale(utcMidnightMs(first.date))}
			{@const lastX = xScale(utcMidnightMs(last.date))}
			{@const firstY = yScale(first.percent)}
			{@const lastY = yScale(last.percent)}
			{@const ruleYs = [...yTicks, goal.value].map((value) => yScale(value))}
			<Svg>
				{#if bandBox}
					<Rect x={bandBox.x} y={0} width={bandBox.width} {height} class="fill-warning/10" />
				{/if}
				<Axis
					placement="left"
					ticks={yTicks}
					format={(value: number) => `${value}%`}
					grid={{ class: 'stroke-border/70' }}
					tickLength={0}
					tickLabelProps={{ class: 'fill-muted-foreground text-[11px] font-mono', dx: -6 }}
				/>
				<line x1={0} x2={width} y1={height} y2={height} class="stroke-foreground" />
				{#each axisLabels(xScale) as tick (tick.date)}
					<Text
						value={tick.label}
						x={tick.x}
						y={height + 6}
						textAnchor={tick.anchor}
						verticalAnchor="start"
						class="fill-muted-foreground text-[11px] font-mono"
					/>
				{/each}
				<Rule y={goal.value} class="stroke-success" stroke-dasharray="4 4" />
				<Text
					value={goal.label}
					x={width + GOAL_LABEL_OFFSET}
					y={yScale(goal.value)}
					verticalAnchor="middle"
					class="fill-muted-foreground text-[11px] font-mono"
				/>
				<Area class="fill-foreground/5" />
				<Spline class="stroke-foreground" fill="none" strokeWidth={2} />
				{#each bars as bar (bar.end)}
					<Rect {...barGeometry(bar, xScale, height)} class={bar.emphasized ? 'fill-warning' : 'fill-warning/40'} />
				{/each}
				{#each barLabels(xScale, height) as label (label.key)}
					<Text
						value={label.value}
						x={label.x}
						y={label.y}
						textAnchor="middle"
						class="fill-foreground text-[11px] font-mono font-semibold"
					/>
				{/each}
				<!-- The forecast never rises, so the line stays below the start point and above the end point. -->
				<Circle cx={firstX} cy={firstY} r={4} class="fill-foreground" />
				<Text
					value={`${first.percent}%`}
					x={firstX + 6}
					y={firstY - valueLabelOffset(firstY, -1, ruleYs, LABEL_GAP)}
					class="fill-foreground text-xs font-mono font-semibold"
				/>
				<g class={endTone}>
					<Circle cx={lastX} cy={lastY} r={END_DOT_RADIUS} class="fill-current" />
					<Text
						value={`${last.percent}%`}
						x={lastX}
						y={lastY + valueLabelOffset(lastY, 1, ruleYs, END_DOT_RADIUS + LABEL_GAP) + VALUE_CAP_PX}
						textAnchor="end"
						class="fill-current text-xs font-mono font-semibold"
					/>
				</g>
			</Svg>
		</Chart>
	</ChartUi.Container>

	<ReportChartTable
		label={ariaLabel}
		columns={['Date', 'Ready', 'Lapses that week', 'In highlighted window']}
		rows={tableRows}
	/>
</div>
