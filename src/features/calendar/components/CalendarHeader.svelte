<script lang="ts">
	import type { CalendarDateHeaderState } from '$features/calendar/utils/calendarRenderState';
	import type { CalendarLane } from '$features/calendar/utils/calendarLanes';
	import { Button } from '$lib/components/ui/button';
	import CalendarLanes from './calendar-lanes/CalendarLanes.svelte';

	interface Props {
		headerCells: readonly CalendarDateHeaderState[];
		lanes?: readonly CalendarLane[];
		onDateClick?: (date: Date) => void;
		scrollLeft?: number;
		scrollbarWidth?: number;
	}

	let { headerCells, lanes = [], onDateClick, scrollLeft = 0, scrollbarWidth = 0 }: Props = $props();

	let dateHeadersEl: HTMLDivElement;

	$effect(() => {
		if (dateHeadersEl && dateHeadersEl.scrollLeft !== scrollLeft) {
			dateHeadersEl.scrollLeft = scrollLeft;
		}
	});
</script>

<div class="sticky top-0 z-10 bg-card">
	<div class="date-headers overflow-hidden" bind:this={dateHeadersEl} style:padding-right={`${scrollbarWidth}px`}>
		<div
			class="grid w-full min-w-[calc(var(--calendar-personnel-column-width)+(var(--calendar-cell-width)*var(--dates-count)))] grid-cols-[var(--calendar-personnel-column-width)_repeat(var(--dates-count),minmax(var(--calendar-cell-width),1fr))]"
		>
			<div
				class="sticky left-0 z-[3] flex items-center border-r border-b bg-muted px-3 py-2 font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase sm:px-4 sm:py-3"
			>
				Personnel
			</div>
			{#each headerCells as header (header.dateKey)}
				<Button
					variant="cell"
					size="none"
					class={[
						'relative flex min-w-0 flex-col gap-px overflow-hidden border-r border-b border-border bg-card py-2 text-center whitespace-normal max-sm:min-h-11 max-sm:min-w-[var(--calendar-cell-width)]',
						header.weekend && 'bg-muted/55',
						header.holiday && 'bg-warning-muted/60',
						header.today && 'bg-primary/10 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
					]}
					aria-label={header.dateLabel}
					title={header.title}
					onclick={() => onDateClick?.(header.date)}
				>
					<span class="font-mono text-[9px] font-semibold tracking-widest text-muted-foreground uppercase sm:text-xs">
						{header.dayName}
					</span>
					<span class="font-display text-base leading-none font-bold text-foreground sm:text-lg"
						>{header.dayOfMonth}</span
					>
				</Button>
			{/each}
		</div>
		<CalendarLanes {lanes} {headerCells} />
	</div>
</div>
