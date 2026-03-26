<script lang="ts">
	import type {
		Personnel,
		AvailabilityEntry,
		StatusType,
		SpecialDay,
		AssignmentType,
		DailyAssignment
	} from '$lib/types';
	import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths, isToday } from '$lib/utils/dates';
	import { exportQuarterToCSV, printQuarterCalendar } from '../utils/calendarExport';
	import CalendarNavigation from './CalendarNavigation.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		startDate: Date;
		personnelByGroup: GroupData[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		specialDays: SpecialDay[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		onDateColumnClick?: (date: Date) => void;
		onToggleViewMode?: () => void;
	}

	let {
		startDate,
		personnelByGroup,
		availabilityEntries,
		statusTypes,
		specialDays,
		assignmentTypes,
		assignments,
		onDateColumnClick,
		onToggleViewMode
	}: Props = $props();

	let viewStartDate = $state(new Date());

	// Reset view when startDate prop changes
	$effect(() => {
		viewStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
	});

	// Get 3 months of data
	const months = $derived.by(() => {
		const result = [];
		for (let i = 0; i < 3; i++) {
			const monthDate = addMonths(viewStartDate, i);
			result.push({
				year: monthDate.getFullYear(),
				month: monthDate.getMonth(),
				name: getMonthName(monthDate.getMonth()),
				dates: getMonthDates(monthDate.getFullYear(), monthDate.getMonth())
			});
		}
		return result;
	});

	function prevQuarter() {
		viewStartDate = addMonths(viewStartDate, -3);
	}

	function nextQuarter() {
		viewStartDate = addMonths(viewStartDate, 3);
	}

	function goToToday() {
		viewStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
	}

	function getStatusForDate(personnelId: string, date: Date): StatusType | null {
		const dateStr = formatDate(date);
		const entry = availabilityEntries.find(
			(e) => e.personnelId === personnelId && dateStr >= e.startDate && dateStr <= e.endDate
		);
		if (!entry) return null;
		return statusTypes.find((s) => s.id === entry.statusTypeId) ?? null;
	}

	function getSpecialDay(date: Date): SpecialDay | null {
		const dateStr = formatDate(date);
		return specialDays.find((s) => s.date === dateStr) ?? null;
	}

	function handleExportCSV() {
		exportQuarterToCSV(viewStartDate, {
			personnelByGroup,
			availabilityEntries,
			statusTypes,
			specialDays,
			assignmentTypes,
			assignments
		});
	}

	function handleExportPDF() {
		printQuarterCalendar(viewStartDate, {
			personnelByGroup,
			availabilityEntries,
			statusTypes,
			specialDays,
			assignmentTypes,
			assignments
		});
	}
</script>

<div class="long-range-wrapper">
	<CalendarNavigation
		title={`${months[0].name} ${months[0].year} – ${months[2].name} ${months[2].year}`}
		onPrev={prevQuarter}
		onNext={nextQuarter}
		onGoToToday={goToToday}
		viewMode="3-month"
		{onToggleViewMode}
		prevLabel="Prev 3 Months"
		nextLabel="Next 3 Months"
		titleTestId="long-range-date-label"
	/>

	<div class="scroll-area">
		<div class="calendar-grid">
			<!-- Header Row with Months and Days -->
			<div class="grid-header">
				<div class="name-cell header-cell">Personnel</div>
				{#each months as month}
					<div
						class="month-header"
						style="width: {month.dates.length * 24}px; min-width: {month.dates.length * 24}px;"
					>
						{month.name}
						{month.year}
					</div>
				{/each}
			</div>

			<!-- Day Numbers Row — clickable to jump to that month -->
			<div class="day-row">
				<div class="name-cell day-header-cell"></div>
				{#each months as month}
					{#each month.dates as date}
						{@const weekend = isWeekend(date)}
						{@const today = isToday(date)}
						{@const special = getSpecialDay(date)}
						<button
							class="day-cell"
							class:weekend
							class:today
							class:holiday={special?.type === 'federal-holiday'}
							title={special?.name ?? `Jump to ${month.name} ${month.year}`}
							onclick={() => onDateColumnClick?.(date)}
						>
							<span class="day-num">{date.getDate()}</span>
						</button>
					{/each}
				{/each}
			</div>

			<!-- Personnel Rows (read-only) -->
			{#each personnelByGroup as grp}
				{#if grp.personnel.length > 0}
					<!-- Group Header -->
					<div class="group-row">
						<div class="name-cell group-name">{grp.group}</div>
						{#each months as month}
							{#each month.dates as date}
								<div class="group-cell"></div>
							{/each}
						{/each}
					</div>

					<!-- Personnel in Group -->
					{#each grp.personnel as person}
						<div class="person-row">
							<div class="name-cell person-name">
								<span class="rank">{person.rank}</span>
								<span class="name">{person.lastName}</span>
							</div>
							{#each months as month}
								{#each month.dates as date}
									{@const status = getStatusForDate(person.id, date)}
									{@const weekend = isWeekend(date)}
									{@const today = isToday(date)}
									<div
										class="status-cell"
										class:weekend
										class:today
										class:has-status={status}
										style={status ? `background-color: ${status.color}` : ''}
										title={status?.name ?? ''}
									>
										{#if status}
											<span class="status-dot"></span>
										{/if}
									</div>
								{/each}
							{/each}
						</div>
					{/each}
				{/if}
			{/each}
		</div>
	</div>

	<div class="legend-bar">
		<div class="legend">
			<span class="legend-label">Status:</span>
			{#each statusTypes as status}
				<span class="legend-item">
					<span class="legend-color" style="background-color: {status.color}"></span>
					{status.name}
				</span>
			{/each}
		</div>
		<div class="legend-actions">
			<button class="btn btn-secondary btn-sm" onclick={handleExportCSV} title="Export to Excel">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
				Excel
			</button>
			<button class="btn btn-secondary btn-sm" onclick={handleExportPDF} title="Print / PDF">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
					<path d="M6 9V2h12v7" />
					<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
					<rect x="6" y="14" width="12" height="8" />
				</svg>
				PDF
			</button>
		</div>
	</div>
</div>

<style>
	/* Inline layout: fills parent container */
	.long-range-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.scroll-area {
		flex: 1;
		overflow: auto;
		scrollbar-gutter: stable;
	}

	.calendar-grid {
		display: flex;
		flex-direction: column;
		min-width: max-content;
	}

	.grid-header,
	.day-row,
	.group-row,
	.person-row {
		display: flex;
	}

	.grid-header {
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.day-row {
		position: sticky;
		top: 29px; /* Height of grid-header */
		z-index: 9;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.name-cell {
		width: var(--personnel-column-width);
		min-width: var(--personnel-column-width);
		max-width: var(--personnel-column-width);
		flex-shrink: 0;
		padding: var(--spacing-xs) var(--spacing-sm);
		position: sticky;
		left: 0;
		z-index: 2;
		background: var(--color-surface);
		border-right: 2px solid var(--color-border);
	}

	.header-cell {
		font-weight: 600;
		background: var(--color-bg);
		color: var(--color-text);
		border-right-color: var(--color-border);
		z-index: 11;
	}

	.month-header {
		text-align: center;
		padding: var(--spacing-xs);
		background: var(--color-bg);
		color: var(--color-text);
		font-weight: 600;
		font-size: var(--font-size-sm);
		border-left: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.month-header:first-of-type {
		border-left: none;
	}

	.day-row {
		border-bottom: 1px solid var(--color-border);
	}

	.day-header-cell {
		background: var(--color-surface);
		z-index: 10;
	}

	.day-cell {
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		flex-shrink: 0;
		height: 32px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		border-left: 1px solid var(--color-border);
		background: var(--color-surface);
		cursor: pointer;
		transition: background-color 0.1s ease;
	}

	.day-cell:hover {
		filter: brightness(0.92);
	}

	.day-cell.weekend {
		background: var(--color-weekend);
	}

	.day-cell.today {
		background: var(--color-today-bg);
		border-left-color: var(--color-today-border);
		border-right: 1px solid var(--color-today-border);
	}

	.day-cell.holiday {
		background: var(--color-holiday);
	}

	.day-num {
		font-weight: 500;
		color: var(--color-text);
	}

	.group-row {
		background: var(--color-chrome);
	}

	.group-name {
		font-weight: 600;
		font-size: var(--font-size-sm);
		color: var(--color-chrome-text);
		background: var(--color-chrome);
	}

	.group-cell {
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		flex-shrink: 0;
		height: 20px;
		background: var(--color-chrome);
		border-left: 1px solid var(--color-chrome-border);
	}

	.person-row {
		border-bottom: 1px solid var(--color-border);
	}

	.person-row:hover .name-cell {
		background: var(--color-bg);
	}

	.person-name {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
	}

	.person-name .rank {
		font-weight: 600;
		color: var(--color-primary);
	}

	.person-name .name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--color-text);
	}

	.status-cell {
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		flex-shrink: 0;
		height: 24px;
		border-left: 1px solid var(--color-border);
		background: var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-cell.weekend {
		background: var(--color-weekend);
	}

	.status-cell.today {
		border-left-color: var(--color-today-border);
		border-right: 1px solid var(--color-today-border);
	}

	.status-cell.has-status {
		border-color: transparent;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.5);
	}

	/* Legend bar */
	.legend-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
	}

	.legend {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		font-size: var(--font-size-sm);
		flex-wrap: wrap;
	}

	.legend-label {
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 2px;
	}

	.legend-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		flex-shrink: 0;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.legend-bar {
			flex-wrap: wrap;
			padding: var(--spacing-xs) var(--spacing-sm);
		}

		.name-cell {
			font-size: var(--font-size-xs);
		}

		.day-cell {
			width: 28px;
			min-width: 28px;
			max-width: 28px;
			height: 36px;
		}

		.day-num {
			font-size: 9px;
		}

		.status-cell {
			width: 28px;
			min-width: 28px;
			max-width: 28px;
			height: 32px;
		}

		.group-cell {
			width: 28px;
			min-width: 28px;
			max-width: 28px;
		}

		.month-header {
			font-size: var(--font-size-xs);
		}

		.person-name .rank {
			font-size: var(--font-size-xs);
		}

		.person-name .name {
			font-size: var(--font-size-xs);
		}

		.legend {
			display: none; /* Too crowded on mobile */
		}

		.legend-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.legend {
			flex-wrap: wrap;
			gap: var(--spacing-sm);
		}
	}
</style>
