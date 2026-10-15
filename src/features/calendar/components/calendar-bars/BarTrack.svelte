<script lang="ts">
	import type { AvailabilityEntry } from '$features/calendar/contracts';
	import type { Bar, BarLane, BarLayout } from '$features/calendar/utils/barLayout';
	import StatusBar from './StatusBar.svelte';

	interface Props {
		layout: BarLayout;
		/** "SGT Okafor, Daniel", the start of every bar's accessible name. */
		personLabel: string;
		size: 'month' | 'compact';
		selectedEntryId?: string | null;
		onOpenEntry?: (entry: AvailabilityEntry, anchor: HTMLElement) => void;
		onOpenOverflow?: (entryIds: readonly string[], anchor: HTMLElement) => void;
	}

	let { layout, personLabel, size, selectedEntryId = null, onOpenEntry, onOpenOverflow }: Props = $props();

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
		<button
			type="button"
			class={[
				'pointer-events-auto mx-px flex min-w-0 cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none',
				bar.entry.id === selectedEntryId && 'ring-2 ring-foreground ring-offset-1'
			]}
			style:grid-column={columns(bar)}
			style:grid-row={ROWS[bar.lane]}
			aria-label="{personLabel}, {bar.description}"
			aria-haspopup="dialog"
			aria-expanded={bar.entry.id === selectedEntryId}
			data-entry-id={bar.entry.id}
			onclick={(event) => onOpenEntry?.(bar.entry, event.currentTarget)}
		>
			<StatusBar
				class="h-full w-full"
				status={bar.status}
				label={bar.label}
				size={barSize(bar)}
				continuesBefore={bar.continuesBefore}
				continuesAfter={bar.continuesAfter}
			/>
		</button>
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
			+{overflow.spans.length}
		</button>
	{/each}
</div>
