<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { AvailabilityEntry } from '$features/calendar/contracts';
	import { StatusBar, type BarLane, type MarkedDay, type TrackPiece } from '$lib/components/patterns/calendar-bars';
	import type { CalendarBar, CalendarBarLayout } from '$features/calendar/utils/calendarBars';

	interface Props {
		layout: CalendarBarLayout;
		personLabel: string;
		size: 'month' | 'compact';
		selectedEntryId?: string | null;
		selection?: { start: number; end: number } | null;
		onPressEdge?: (event: PointerEvent, bar: CalendarBar, edge: 'start' | 'end') => void;
		onOpenEntry?: (entry: AvailabilityEntry, anchor: HTMLElement) => void;
		onOpenOverflow?: (entryIds: readonly string[], anchor: HTMLElement) => void;
		/** Days whose bottom lane holds a marker; `fitMarkers` keeps bars out of their space. */
		markers?: readonly MarkedDay[];
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
		markers = [],
		marker
	}: Props = $props();

	const EDGES = ['start', 'end'] as const;
	const NO_LABEL = { kind: 'none' } as const;

	const ROWS: Record<BarLane, string> = { full: '2 / 5', top: '2 / 3', bottom: '4 / 5' };

	function columns(item: { start: number; end: number }) {
		return `${item.start + 1} / ${item.end + 2}`;
	}

	function piecesOf(item: { start: number; end: number; pieces?: readonly TrackPiece[] }): readonly TrackPiece[] {
		return item.pieces ?? [{ start: item.start, end: item.end, yieldsEnd: false }];
	}

	// A grid item's percentage margin resolves against its own area, so this is three quarters of one day.
	function yieldedEnd(piece: TrackPiece) {
		return piece.yieldsEnd ? `calc(75% / ${piece.end - piece.start + 1} + 1px)` : undefined;
	}

	function barSize(bar: CalendarBar) {
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
		{@const pieces = piecesOf(bar)}
		{#each pieces as piece, at (piece.start)}
			{@const first = at === 0}
			<!-- Later pieces repeat the first one's action for the pointer only, so the entry stays one stop. -->
			<button
				type="button"
				class={[
					'pointer-events-auto relative mx-px flex min-w-0 cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none',
					selected && 'ring-2 ring-foreground ring-offset-1'
				]}
				style:grid-column={columns(piece)}
				style:grid-row={ROWS[bar.lane]}
				style:margin-right={yieldedEnd(piece)}
				tabindex={first ? undefined : -1}
				aria-hidden={first ? undefined : 'true'}
				aria-label={first ? name : undefined}
				aria-haspopup={first ? 'dialog' : undefined}
				aria-expanded={first ? selected : undefined}
				data-entry-id={first ? bar.entry.id : undefined}
				onclick={(event) => onOpenEntry?.(bar.entry, event.currentTarget)}
			>
				<!-- Hover text sits inside the button, where it cannot become a description that repeats the name. -->
				<StatusBar
					class="h-full w-full"
					title={name}
					status={bar.status}
					label={first ? bar.label : NO_LABEL}
					size={barSize(bar)}
					continuesBefore={first && bar.continuesBefore}
					continuesAfter={at === pieces.length - 1 && bar.continuesAfter}
				/>
			</button>
		{/each}
		{#if onPressEdge && selected && !bar.entry.id.startsWith('temp-')}
			{#each EDGES as edge (edge)}
				{@const piece = edge === 'start' ? pieces[0] : pieces[pieces.length - 1]}
				{#if !(edge === 'start' ? bar.continuesBefore : bar.continuesAfter)}
					<!-- A sibling of the bar rather than a child, because pointer events on a button's children are not reliable. -->
					<span
						aria-hidden="true"
						data-edge={edge}
						class={[
							'pointer-events-auto z-[1] mx-px flex w-2 cursor-ew-resize items-center justify-center',
							edge === 'start' ? 'justify-self-start' : 'justify-self-end'
						]}
						style:grid-column={columns(piece)}
						style:grid-row={ROWS[bar.lane]}
						style:margin-right={yieldedEnd(piece)}
						onpointerdown={(event) => onPressEdge(event, bar, edge)}
					>
						<span class="h-3/5 w-0.5 rounded-full" style:background-color={bar.status.textColor}></span>
					</span>
				{/if}
			{/each}
		{/if}
	{/each}
	{#each layout.overflows as overflow (overflow.spans[0].entry.id)}
		{@const name = `${personLabel}, ${overflow.description}`}
		{#each piecesOf(overflow) as piece, at (piece.start)}
			{@const first = at === 0}
			<button
				type="button"
				class="pointer-events-auto mx-px flex min-w-0 cursor-pointer items-center overflow-clip rounded-[3px] border border-dashed border-muted-foreground/60 bg-muted px-1 font-mono text-[9px] leading-none font-semibold text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				style:grid-column={columns(piece)}
				style:grid-row={ROWS.bottom}
				style:margin-right={yieldedEnd(piece)}
				tabindex={first ? undefined : -1}
				aria-hidden={first ? undefined : 'true'}
				aria-label={first ? name : undefined}
				aria-haspopup={first ? 'dialog' : undefined}
				onclick={(event) =>
					onOpenOverflow?.(
						overflow.spans.map((span) => span.entry.id),
						event.currentTarget
					)}
			>
				<span class="w-full" title={name}>+{overflow.spans.length}</span>
			</button>
		{/each}
	{/each}
	{#if marker}
		{#each markers as { day, shared } (day)}
			<div
				class="flex min-w-0 items-center justify-end gap-px px-px"
				style:grid-column={columns({ start: day, end: day })}
				style:grid-row={ROWS.bottom}
				style:margin-left={shared ? '25%' : undefined}
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
