<script lang="ts">
	import type { SpecialDay } from '../types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import { isWeekend, isToday, formatDate, getDayName } from '../utils/dates';

	interface Props {
		year: number;
		monthName: string;
		dates: Date[];
		specialDays: SpecialDay[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		onPrevMonth: () => void;
		onNextMonth: () => void;
		onGoToToday: () => void;
		onDateClick?: (date: Date) => void;
	}

	let { year, monthName, dates, specialDays, assignmentTypes, assignments, onPrevMonth, onNextMonth, onGoToToday, onDateClick }: Props =
		$props();

	function isHoliday(date: Date): boolean {
		const dateStr = formatDate(date);
		return specialDays.some((d) => d.date === dateStr);
	}

	function getHolidayName(date: Date): string | undefined {
		const dateStr = formatDate(date);
		return specialDays.find((d) => d.date === dateStr)?.name;
	}

	function getFrontDeskGroup(date: Date): string | null {
		const dateStr = formatDate(date);
		// Look up by shortName since database generates UUIDs for IDs
		const fdsType = assignmentTypes.find((t) => t.shortName === 'FDS');
		if (!fdsType) return null;
		const assignment = assignments.find(
			(a) => a.date === dateStr && a.assignmentTypeId === fdsType.id
		);
		return assignment?.assigneeId || null;
	}
</script>

<div class="calendar-header">
	<div class="navigation">
		<div class="month-nav">
			<button class="btn btn-secondary btn-sm" onclick={onPrevMonth}>
				&larr; Prev
			</button>
			<h2 class="month-title">{monthName} {year}</h2>
			<button class="btn btn-secondary btn-sm" onclick={onNextMonth}>
				Next &rarr;
			</button>
		</div>
		<button class="btn btn-primary btn-sm" onclick={onGoToToday}>Today</button>
	</div>

	<div class="date-headers">
		<div class="personnel-header-spacer">Personnel</div>
		<div class="date-columns">
			{#each dates as date (formatDate(date))}
				{@const holiday = isHoliday(date)}
				{@const frontDeskGroup = getFrontDeskGroup(date)}
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
					{#if frontDeskGroup}
						<span class="front-desk-group" title="Front Desk: {frontDeskGroup}">{frontDeskGroup}</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.calendar-header {
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.navigation {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.month-nav {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.month-title {
		font-size: var(--font-size-xl);
		font-weight: 600;
		min-width: 180px;
		text-align: center;
	}

	.date-headers {
		display: flex;
		padding-right: 8px; /* Match scrollbar width */
	}

	.personnel-header-spacer {
		width: var(--personnel-column-width);
		min-width: var(--personnel-column-width);
		padding: var(--spacing-sm);
		font-weight: 600;
		font-size: var(--font-size-sm);
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		position: sticky;
		left: 0;
		z-index: 3;
		color: var(--color-text);
	}

	.date-columns {
		display: flex;
		flex: 1;
	}

	.date-header {
		flex: 1;
		min-width: var(--cell-width);
		padding: var(--spacing-xs) 0;
		text-align: center;
		border-left: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: background-color 0.1s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.date-header:first-child {
		border-left: none;
	}

	.date-header:hover {
		filter: brightness(0.95);
	}

	.day-name {
		display: block;
		font-size: 10px;
		color: var(--color-text-muted);
	}

	.day-number {
		display: block;
		font-weight: 600;
		color: var(--color-text);
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

	.front-desk-group {
		font-size: 7px;
		font-weight: 600;
		color: var(--color-text-muted);
		background: var(--color-border);
		padding: 1px 3px;
		border-radius: 2px;
		line-height: 1;
		margin-top: 2px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
