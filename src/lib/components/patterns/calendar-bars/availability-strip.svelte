<script lang="ts" module>
	/** One day column of a regular strip, in the viewer's day. */
	export interface StripDay {
		key: string;
		weekday: string;
		date: number;
		today: boolean;
		weekend: boolean;
		/** A Special Day's short label, drawn as a dashed outline under any bar. */
		closure: string | null;
	}
</script>

<script lang="ts">
	import type { BarLane, BarLayout } from './bar-layout';
	import StatusBar from './status-bar.svelte';

	type Props =
		| { size?: 'compact'; days: number; layout: BarLayout | null }
		| { size: 'regular'; columns: readonly StripDay[]; layout: BarLayout };

	let props: Props = $props();

	const ROWS: Record<BarLane, string> = { full: '1 / 3', top: '1 / 2', bottom: '2 / 3' };
	const NO_LABEL = { kind: 'none' } as const;

	function columns(item: { start: number; end: number }) {
		return `${item.start + 1} / ${item.end + 2}`;
	}
</script>

<!-- Both sizes are drawings for sighted users; each consumer names every entry in text beside the strip. -->
{#if props.size === 'regular'}
	{@const days = props.columns.length}
	<div data-slot="availability-strip" aria-hidden="true" class="flex flex-col gap-1.5">
		<div class="grid gap-x-[3px]" style:grid-template-columns="repeat({days}, minmax(0, 1fr))">
			{#each props.columns as day (day.key)}
				<div
					class={[
						'flex min-w-0 flex-col gap-0.5 border-t-[3px] px-1.5 pt-2 pb-1',
						day.today ? 'border-accent' : 'border-border'
					]}
				>
					<span
						class={[
							'font-mono text-[10px] leading-3 tracking-[0.08em] uppercase',
							day.today ? 'font-semibold text-accent-text' : 'font-medium text-muted-foreground'
						]}
					>
						{day.today ? 'Today' : day.weekday}
					</span>
					<span
						class={[
							'font-heading text-[22px] leading-6 font-bold',
							day.weekend ? 'text-muted-foreground/60' : 'text-foreground'
						]}
					>
						{day.date}
					</span>
				</div>
			{/each}
		</div>
		<div
			class="grid h-[26px] grid-rows-2 gap-x-[3px] gap-y-px"
			style:grid-template-columns="repeat({days}, minmax(0, 1fr))"
		>
			{#each props.columns as day, index (day.key)}
				{#if day.closure}
					<span
						class="flex min-w-0 items-center overflow-clip rounded-[3px] border border-dashed border-muted-foreground/50 px-1.5 font-mono text-[11px] leading-none font-medium tracking-[0.04em] text-muted-foreground"
						style="grid-column: {index + 1}; grid-row: 1 / 3"
					>
						{day.closure}
					</span>
				{/if}
			{/each}
			{#each props.layout.bars as bar (bar.entry.id)}
				<StatusBar
					class="h-full w-full"
					title={bar.description}
					status={bar.status}
					label={bar.label}
					size={bar.lane === 'full' ? 'regular' : 'lane'}
					continuesBefore={bar.continuesBefore}
					continuesAfter={bar.continuesAfter}
					style="grid-column: {columns(bar)}; grid-row: {ROWS[bar.lane]}"
				/>
			{/each}
			{#each props.layout.overflows as overflow (overflow.spans[0].entry.id)}
				<span
					class="flex min-w-0 items-center overflow-clip rounded-[3px] border border-dashed border-muted-foreground/60 bg-muted px-1 font-mono text-[10px] leading-none font-semibold text-muted-foreground"
					title={overflow.description}
					style="grid-column: {columns(overflow)}; grid-row: {ROWS.bottom}"
				>
					+{overflow.spans.length}
				</span>
			{/each}
		</div>
	</div>
{:else}
	<span
		data-slot="availability-strip"
		aria-hidden="true"
		class="day-boxes relative isolate ml-auto grid h-5 shrink-0 grid-rows-2 gap-px"
		style:grid-template-columns="repeat({props.days}, minmax(0, 1fr))"
		style:--days={props.days}
		style:width="{props.days * 1.625}rem"
	>
		{#if props.layout}
			{#each props.layout.bars as bar (bar.entry.id)}
				<StatusBar
					class="mx-px h-full w-full"
					title={bar.description}
					status={bar.status}
					label={NO_LABEL}
					size="compact"
					continuesBefore={bar.continuesBefore}
					continuesAfter={bar.continuesAfter}
					style="grid-column: {columns(bar)}; grid-row: {ROWS[bar.lane]}"
				/>
			{/each}
			{#each props.layout.overflows as overflow (overflow.spans[0].entry.id)}
				<span
					class="mx-px flex min-w-0 items-center overflow-clip rounded-[3px] border border-dashed border-muted-foreground/60 bg-muted px-1 font-mono text-[8px] leading-none font-semibold text-muted-foreground"
					title={overflow.description}
					style="grid-column: {columns(overflow)}; grid-row: {ROWS.bottom}"
				>
					+{overflow.spans.length}
				</span>
			{/each}
		{/if}
	</span>
{/if}

<style>
	/* One box per day drawn as a tiled mask, so a row with no entries is a single element. The tile
	   pitch is the grid's column pitch: (width + 1px of column gap) / days. */
	.day-boxes::before,
	.day-boxes::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		mask-repeat: repeat-x;
		mask-size: calc((100% + 1px) / var(--days)) 100%;
	}
	.day-boxes::before {
		background: var(--color-border);
		mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 20' preserveAspectRatio='none'%3E%3Crect x='1' width='23' height='20' rx='3'/%3E%3C/svg%3E");
	}
	.day-boxes::after {
		background: var(--color-card);
		mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 20' preserveAspectRatio='none'%3E%3Crect x='2' y='1' width='21' height='18' rx='2'/%3E%3C/svg%3E");
	}
</style>
