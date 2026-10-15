<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { AvailabilityEntry } from '$features/calendar/contracts';
	import type { Bar, BarLane, BarLayout } from '$features/calendar/utils/barLayout';
	import StatusBar from './StatusBar.svelte';

	interface Props {
		layout: BarLayout;
		personLabel: string;
		size: 'month' | 'compact';
		selectedEntryId?: string | null;
		selection?: { start: number; end: number } | null;
		onPressEdge?: (event: PointerEvent, bar: Bar, edge: 'start' | 'end') => void;
		onOpenEntry?: (entry: AvailabilityEntry, anchor: HTMLElement) => void;
		onOpenOverflow?: (entryIds: readonly string[], anchor: HTMLElement) => void;
		/** Days whose bottom lane holds a marker; `fitMarkers` keeps bars out of them. */
		markerDays?: readonly number[];
		marker?: Snippet<[number]>;
	}

	let {
		layout,
		personLabel,
		size,
		selectedEntryId = null,
		selection = null,
		onPressEdge,
		onOpenEntry,
		onOpenOverflow,
		markerDays = [],
		marker
	}: Props = $props();

	const EDGES = ['start', 'end'] as const;

	const ROWS: Record<BarLane, string> = { full: '2 / 5', top: '2 / 3', bottom: '4 / 5' };

	function columns(item: { start: number; end: number }) {
		return `${item.start + 1} / ${item.end + 2}`;
	}

	function barSize(bar: Bar) {
		if (size === 'compact') return 'compact';
		return bar.lane === 'full' ? 'regular' : 'lane';
	}
</script>

<!-- The last grid row is the reserved commitment slot (#1537), so filling it can never move a bar. -->
<div
	data-slot="bar-track"
	class={[
		'pointer-events-none absolute inset-x-0 z-[1] grid grid-cols-[repeat(var(--dates-count),minmax(0,1fr))]',
		size === 'month'
			? 'inset-y-0 my-auto h-9 grid-rows-[3px_1fr_2px_1fr_6px]'
			: 'inset-y-0 grid-rows-[6px_1fr_1px_1fr_5px]'
	]}
	style:grid-column="2 / -1"
	style:grid-row="1 / span 1"
>
	{#each layout.bars as bar (bar.entry.id)}
		{@const name = `${personLabel}, ${bar.description}`}
		{@const selected = bar.entry.id === selectedEntryId}
		<button
			type="button"
			class={[
				'pointer-events-auto relative mx-px flex min-w-0 cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none',
				selected && 'ring-2 ring-foreground ring-offset-1'
			]}
			style:grid-column={columns(bar)}
			style:grid-row={ROWS[bar.lane]}
			aria-label={name}
			aria-haspopup="dialog"
			aria-expanded={selected}
			data-entry-id={bar.entry.id}
			onclick={(event) => onOpenEntry?.(bar.entry, event.currentTarget)}
		>
			<!-- Hover text sits inside the button, where it cannot become a description that repeats the name. -->
			<StatusBar
				class="h-full w-full"
				title={name}
				status={bar.status}
				label={bar.label}
				size={barSize(bar)}
				continuesBefore={bar.continuesBefore}
				continuesAfter={bar.continuesAfter}
			/>
		</button>
		{#if onPressEdge && selected && !bar.entry.id.startsWith('temp-')}
			{#each EDGES as edge (edge)}
				{#if !(edge === 'start' ? bar.continuesBefore : bar.continuesAfter)}
					<!-- A sibling of the bar rather than a child, because pointer events on a button's children are not reliable. -->
					<span
						aria-hidden="true"
						data-edge={edge}
						class={[
							'pointer-events-auto z-[1] mx-px flex w-2 cursor-ew-resize items-center justify-center',
							edge === 'start' ? 'justify-self-start' : 'justify-self-end'
						]}
						style:grid-column={columns(bar)}
						style:grid-row={ROWS[bar.lane]}
						onpointerdown={(event) => onPressEdge(event, bar, edge)}
					>
						<span class="h-3/5 w-0.5 rounded-full" style:background-color={bar.status.textColor}></span>
					</span>
				{/if}
			{/each}
		{/if}
	{/each}
	{#each layout.overflows as overflow (overflow.spans[0].entry.id)}
		<button
			type="button"
			class="pointer-events-auto mx-px flex min-w-0 cursor-pointer items-center overflow-clip rounded-[3px] border border-dashed border-muted-foreground/60 bg-muted px-1 font-mono text-[9px] leading-none font-semibold text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			style:grid-column={columns(overflow)}
			style:grid-row={ROWS.bottom}
			aria-label="{personLabel}, {overflow.description}"
			aria-haspopup="dialog"
			onclick={(event) =>
				onOpenOverflow?.(
					overflow.spans.map((span) => span.entry.id),
					event.currentTarget
				)}
		>
			<span class="w-full" title="{personLabel}, {overflow.description}">+{overflow.spans.length}</span>
		</button>
	{/each}
	{#if marker}
		{#each markerDays as day (day)}
			<div
				class="flex min-w-0 items-center justify-end gap-px px-px"
				style:grid-column={columns({ start: day, end: day })}
				style:grid-row={ROWS.bottom}
			>
				{@render marker(day)}
			</div>
		{/each}
	{/if}
	{#if selection}
		{@const days = selection.end - selection.start + 1}
		<div
			data-slot="calendar-selection"
			class="z-[2] mx-px flex items-center overflow-clip rounded-md border border-dashed border-ring bg-card px-1.5 font-mono text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap text-foreground uppercase"
			style:grid-column={columns(selection)}
			style:grid-row={ROWS.full}
		>
			{days}
			{days === 1 ? 'day' : 'days'}
		</div>
	{/if}
</div>
