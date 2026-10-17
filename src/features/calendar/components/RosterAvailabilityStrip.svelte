<script lang="ts">
	import type { BarLane, BarLayout } from '$features/calendar/utils/barLayout';
	import StatusBar from './calendar-bars/StatusBar.svelte';

	interface Props {
		days: number;
		layout: BarLayout | null;
	}

	let { days, layout }: Props = $props();

	const ROWS: Record<BarLane, string> = { full: '1 / 3', top: '1 / 2', bottom: '2 / 3' };
	const NO_LABEL = { kind: 'none' } as const;

	function columns(item: { start: number; end: number }) {
		return `${item.start + 1} / ${item.end + 2}`;
	}
</script>

<!-- The row's hint names every entry, so the strip is a drawing for sighted users only. -->
<span
	data-slot="roster-availability-strip"
	aria-hidden="true"
	class="grid h-5 shrink-0 grid-rows-2 gap-px"
	style:grid-template-columns="repeat({days}, minmax(0, 1fr))"
	style:width="{days * 1.625}rem"
>
	{#each { length: days }, day (day)}
		<span class="row-span-2 mx-px rounded-[3px] border border-border bg-card" style:grid-column={day + 1}></span>
	{/each}
	{#if layout}
		{#each layout.bars as bar (bar.entry.id)}
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
		{#each layout.overflows as overflow (overflow.spans[0].entry.id)}
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
