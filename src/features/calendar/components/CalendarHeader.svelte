<script lang="ts">
	import type { CalendarDateHeaderState } from '$features/calendar/utils/calendarRenderState';
	import { Button } from '$lib/components/ui/button';
	import CalendarNavigation from './CalendarNavigation.svelte';

	interface Props {
		year: number;
		month: number;
		monthName: string;
		headerCells: readonly CalendarDateHeaderState[];
		onPrevMonth: () => void;
		onNextMonth: () => void;
		onGoToToday: () => void;
		onNavigateToMonth?: (year: number, month: number) => void;
		onDateClick?: (date: Date) => void;
		scrollLeft?: number;
		scrollbarWidth?: number;
		viewMode?: 'month' | '3-month';
		onToggleViewMode?: () => void;
	}

	let {
		year,
		month,
		monthName,
		headerCells,
		onPrevMonth,
		onNextMonth,
		onGoToToday,
		onNavigateToMonth,
		onDateClick,
		scrollLeft = 0,
		scrollbarWidth = 0,
		viewMode = 'month',
		onToggleViewMode
	}: Props = $props();

	let dateHeadersEl: HTMLDivElement;

	$effect(() => {
		if (dateHeadersEl && dateHeadersEl.scrollLeft !== scrollLeft) {
			dateHeadersEl.scrollLeft = scrollLeft;
		}
	});
</script>

<div class="sticky top-0 z-10 bg-card">
	<CalendarNavigation
		title={`${monthName} ${year}`}
		onPrev={onPrevMonth}
		onNext={onNextMonth}
		{onGoToToday}
		{viewMode}
		{onToggleViewMode}
		titleTestId="calendar-month-label"
		pickerYear={year}
		pickerMonth={month}
		onSelectMonthYear={onNavigateToMonth}
	/>

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
					aria-label={header.headerAssignment
						? `${header.dateLabel}, ${header.headerAssignment.assignmentTypeName}: ${header.headerAssignment.assigneeLabel}`
						: header.dateLabel}
					title={header.title}
					onclick={() => onDateClick?.(header.date)}
				>
					<span class="font-mono text-[9px] font-semibold tracking-widest text-muted-foreground uppercase sm:text-xs">
						{header.dayName}
					</span>
					<span class="font-display text-base leading-none font-bold text-foreground sm:text-lg"
						>{header.dayOfMonth}</span
					>
					{#if header.headerAssignment}
						<span
							class="header-assignment-badge mt-0.5 max-w-[calc(100%-0.375rem)] overflow-hidden rounded-sm border border-primary/20 bg-primary/10 px-1 py-px font-mono text-[8px] leading-none font-medium text-primary uppercase sm:text-[9px]"
							title="{header.headerAssignment.assignmentTypeName}: {header.headerAssignment.assigneeLabel}"
						>
							{header.headerAssignment.assigneeLabel}
						</span>
					{/if}
				</Button>
			{/each}
		</div>
	</div>
</div>
