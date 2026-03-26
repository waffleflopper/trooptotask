<script lang="ts">
	import type { SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';
	import { isWeekend, isToday, formatDate, getDayName } from '$lib/utils/dates';

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
		scrollLeft?: number;
		scrollbarWidth?: number;
		viewMode?: 'month' | '3-month';
		onToggleViewMode?: () => void;
	}

	let {
		year,
		monthName,
		dates,
		specialDays,
		assignmentTypes,
		assignments,
		onPrevMonth,
		onNextMonth,
		onGoToToday,
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

	function getHeaderAssignment(date: Date): { assignmentTypeName: string; assigneeId: string } | null {
		const dateStr = formatDate(date);
		const headerType = assignmentTypes.find((t) => t.showInDateHeader);
		if (!headerType) return null;
		const assignment = assignments.find((a) => a.date === dateStr && a.assignmentTypeId === headerType.id);
		if (!assignment?.assigneeId) return null;
		return {
			assignmentTypeName: headerType.name,
			assigneeId: assignment.assigneeId
		};
	}
</script>

<div class="calendar-header">
	<div class="navigation">
		<div class="month-nav">
			<button class="btn btn-secondary btn-sm" data-testid="calendar-prev-month" onclick={onPrevMonth}>
				&larr; Prev
			</button>
			<h2 class="month-title" data-testid="calendar-month-label">{monthName} {year}</h2>
			<button class="btn btn-secondary btn-sm" data-testid="calendar-next-month" onclick={onNextMonth}>
				Next &rarr;
			</button>
		</div>
		<div class="nav-actions">
			{#if onToggleViewMode}
				<button
					class="view-toggle"
					class:active={viewMode === '3-month'}
					data-testid="calendar-view-toggle"
					onclick={onToggleViewMode}
					title={viewMode === 'month' ? 'Switch to 3-month view' : 'Switch to month view'}
				>
					<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
						<path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
					</svg>
					3-Month
				</button>
			{/if}
			<button class="btn btn-primary btn-sm" onclick={onGoToToday}>Today</button>
		</div>
	</div>

	<div class="date-headers" bind:this={dateHeadersEl} style="padding-right: {scrollbarWidth}px">
		<div class="personnel-header-spacer">Personnel</div>
		<div class="date-columns">
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
						<span class="front-desk-group" title="{headerAssignment.assignmentTypeName}: {headerAssignment.assigneeId}">
							{headerAssignment.assigneeId}
						</span>
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

	.nav-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		font-weight: 500;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.view-toggle:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.view-toggle.active {
		border-color: var(--color-primary);
		background: var(--color-primary);
		color: var(--color-primary-contrast);
	}

	.date-headers {
		display: flex;
		overflow-x: auto;
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE/Edge */
	}

	.date-headers::-webkit-scrollbar {
		display: none; /* Chrome/Safari */
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
		flex: 1 1 0;
		min-width: var(--cell-width);
		max-width: none;
		width: 0; /* Force flex-basis behavior */
		overflow: hidden;
		padding: var(--spacing-xs) 0;
		text-align: center;
		border: 1px solid var(--color-border);
		border-left: none;
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: background-color 0.1s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
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

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.navigation {
			flex-wrap: wrap;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm);
		}

		.month-nav {
			width: 100%;
			justify-content: space-between;
		}

		.month-title {
			font-size: var(--font-size-lg);
			min-width: unset;
		}

		.date-header {
			min-width: var(--cell-width);
			min-height: 44px; /* Touch target */
		}

		.personnel-header-spacer {
			width: var(--personnel-column-width);
			min-width: var(--personnel-column-width);
			font-size: var(--font-size-xs);
			padding: var(--spacing-xs);
		}

		.day-name {
			font-size: 8px;
		}

		.day-number {
			font-size: var(--font-size-xs);
		}

		.front-desk-group {
			font-size: 6px;
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
