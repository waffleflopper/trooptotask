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

<div class="calendar-header">
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
		class="date-headers"
		bind:this={dateHeadersEl}
		style="padding-right: {scrollbarWidth}px; --dates-count: {dates.length};"
	>
		<div class="date-headers-grid">
			<div class="personnel-header-spacer">Personnel</div>
			{#each dates as date (formatDate(date))}
				{@const holiday = isHoliday(date)}
				{@const headerAssignment = getHeaderAssignment(date)}
				<button
					class="date-header"
					class:weekend={isWeekend(date)}
					class:today={isToday(date)}
					class:holiday
					title={getHolidayName(date) || 'Click to set daily assignments'}
					onclick={() => onDateClick?.(date)}
				>
					<span class="day-name">{getDayName(date)}</span>
					<span class="day-number">{date.getDate()}</span>
					{#if headerAssignment}
						<span
							class="header-assignment-badge"
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

<style>
	.calendar-header {
		background: var(--surface-panel);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.date-headers {
		overflow: hidden;
	}

	.date-headers-grid {
		display: grid;
		grid-template-columns: var(--personnel-column-width) repeat(var(--dates-count), minmax(var(--cell-width), 1fr));
		width: 100%;
		min-width: calc(var(--personnel-column-width) + (var(--cell-width) * var(--dates-count)));
	}

	.personnel-header-spacer {
		display: flex;
		align-items: center;
		padding: var(--sp-3) var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		background: var(--surface-subtle);
		border-right: var(--border-thin);
		border-bottom: var(--border-thin);
		position: sticky;
		left: 0;
		z-index: 3;
		color: var(--text-secondary);
	}

	.date-header {
		appearance: none;
		border: none;
		min-width: 0;
		overflow: hidden;
		padding: var(--sp-2) 0;
		text-align: center;
		border-right: var(--border-thin);
		border-bottom: var(--border-thin);
		background: var(--surface-panel);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			color var(--transition-fast),
			box-shadow var(--transition-fast);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
	}

	.date-header:hover {
		background: color-mix(in srgb, var(--surface-subtle) 82%, var(--surface-panel) 18%);
	}

	.date-header:hover .day-number {
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-color: var(--ink-35);
	}

	.day-name {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.day-number {
		display: block;
		font-family: var(--font-display);
		font-size: clamp(1rem, 0.9rem + 0.4vw, 1.3rem);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--text-primary);
	}

	.weekend {
		background-color: var(--color-weekend);
	}

	.holiday {
		background-color: var(--color-holiday);
	}

	.today {
		background-color: var(--color-today-bg);
		box-shadow: inset 0 -2px 0 var(--color-today-border);
	}

	.header-assignment-badge {
		max-width: calc(100% - 6px);
		padding: 1px 4px;
		border: 1px solid color-mix(in srgb, var(--border-default) 70%, var(--amber) 30%);
		border-radius: 2px;
		background: color-mix(in srgb, var(--amber-light) 78%, var(--surface-panel) 22%);
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--amber-dark);
		line-height: 1;
		margin-top: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.date-header {
			min-width: var(--cell-width);
			min-height: 44px; /* Touch target */
		}

		.personnel-header-spacer {
			width: var(--personnel-column-width);
			min-width: var(--personnel-column-width);
			padding: var(--sp-2) var(--sp-3);
		}

		.day-name {
			font-size: 9px;
		}

		.day-number {
			font-size: 1rem;
		}

		.header-assignment-badge {
			font-size: 8px;
			padding: 0 2px;
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.personnel-header-spacer {
			width: var(--personnel-column-width);
			min-width: var(--personnel-column-width);
		}
	}
</style>
