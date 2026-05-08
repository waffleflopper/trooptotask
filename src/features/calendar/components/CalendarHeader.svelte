<script lang="ts">
	import type { Personnel, SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';
	import { isWeekend, isToday, formatDate, getDayName } from '$lib/utils/dates';
	import CalendarNavigation from './CalendarNavigation.svelte';

	interface Props {
		year: number;
		month: number;
		monthName: string;
		dates: Date[];
		specialDays: SpecialDay[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		personnelById: Map<string, Personnel>;
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
		dates,
		specialDays,
		assignmentTypes,
		assignments,
		personnelById,
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

	function isHoliday(date: Date): boolean {
		const dateStr = formatDate(date);
		return specialDays.some((d) => d.date === dateStr);
	}

	function getHolidayName(date: Date): string | undefined {
		const dateStr = formatDate(date);
		return specialDays.find((d) => d.date === dateStr)?.name;
	}

	function getHeaderAssignment(date: Date): { assignmentTypeName: string; assigneeLabel: string } | null {
		const dateStr = formatDate(date);
		const headerType = assignmentTypes.find((t) => t.showInDateHeader);
		if (!headerType) return null;
		const assignment = assignments.find((a) => a.date === dateStr && a.assignmentTypeId === headerType.id);
		if (!assignment?.assigneeId) return null;

		const assigneeLabel =
			headerType.assignTo === 'personnel'
				? (() => {
						const person = personnelById.get(assignment.assigneeId);
						return person ? `${person.rank} ${person.lastName}` : assignment.assigneeId;
					})()
				: assignment.assigneeId;

		return {
			assignmentTypeName: headerType.name,
			assigneeLabel
		};
	}
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

	<div
		class="date-headers overflow-hidden"
		bind:this={dateHeadersEl}
		style="padding-right: {scrollbarWidth}px; --dates-count: {dates.length}; --calendar-date-columns: var(--personnel-column-width) repeat(var(--dates-count), minmax(var(--cell-width), 1fr));"
	>
		<div
			class="grid w-full min-w-[calc(var(--personnel-column-width)+(var(--cell-width)*var(--dates-count)))] grid-cols-[var(--calendar-date-columns)]"
		>
			<div
				class="sticky left-0 z-[3] flex items-center border-r border-b bg-muted px-3 py-2 font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase sm:px-4 sm:py-3"
			>
				Personnel
			</div>
			{#each dates as date (formatDate(date))}
				{@const holiday = isHoliday(date)}
				{@const headerAssignment = getHeaderAssignment(date)}
				<button
					class={[
						'flex min-w-0 cursor-pointer flex-col items-center gap-px overflow-hidden border-r border-b bg-card px-0 py-2 text-center transition-colors hover:bg-muted focus-visible:ring-ring focus-visible:z-[2] focus-visible:ring-2 focus-visible:outline-none max-sm:min-h-11 max-sm:min-w-[var(--cell-width)]',
						isWeekend(date) && 'bg-muted/55',
						holiday && 'bg-warning-muted/60',
						isToday(date) && 'bg-primary/10 shadow-[inset_0_-2px_0_var(--primary)]'
					]}
					title={getHolidayName(date) || 'Click to set daily assignments'}
					onclick={() => onDateClick?.(date)}
				>
					<span class="font-mono text-[9px] font-semibold tracking-widest text-muted-foreground uppercase sm:text-xs">
						{getDayName(date)}
					</span>
					<span class="font-display text-base leading-none font-bold text-foreground sm:text-lg">{date.getDate()}</span>
					{#if headerAssignment}
						<span
							class="header-assignment-badge mt-0.5 max-w-[calc(100%-0.375rem)] overflow-hidden rounded-sm border border-primary/20 bg-primary/10 px-1 py-px font-mono text-[8px] leading-none font-medium text-primary uppercase sm:text-[9px]"
							title="{headerAssignment.assignmentTypeName}: {headerAssignment.assigneeLabel}"
						>
							{headerAssignment.assigneeLabel}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</div>
