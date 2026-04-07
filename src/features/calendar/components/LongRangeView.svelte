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
	import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
	import { buildDutyEventBadgesByPerson } from '$features/calendar/utils/dutyEventBadges';

	/** Must match --long-range-col-width in CSS */
	const COL_WIDTH = 24;

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
		dutyEvents?: DutyEvent[];
		dutyStartDayOnly?: boolean;
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
		dutyEvents = [],
		dutyStartDayOnly = true,
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

	const visibleDateKeys = $derived.by(() => months.flatMap((month) => month.dates.map((date) => formatDate(date))));

	const statusTypeById = $derived.by(() => {
		const map = new Map<string, StatusType>();
		for (const statusType of statusTypes) {
			map.set(statusType.id, statusType);
		}
		return map;
	});

	const specialDayByDate = $derived.by(() => {
		const map = new Map<string, SpecialDay>();
		for (const specialDay of specialDays) {
			map.set(specialDay.date, specialDay);
		}
		return map;
	});

	const dutyBadgesByPerson = $derived.by(() => buildDutyEventBadgesByPerson(dutyEvents, { startDayOnly: dutyStartDayOnly }));

	const statusByPersonnelDate = $derived.by(() => {
		const map = new Map<string, StatusType>();
		for (const entry of availabilityEntries) {
			const statusType = statusTypeById.get(entry.statusTypeId);
			if (!statusType) continue;
			for (const dateKey of visibleDateKeys) {
				if (dateKey >= entry.startDate && dateKey <= entry.endDate) {
					map.set(`${entry.personnelId}:${dateKey}`, statusType);
				}
			}
		}
		return map;
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

	function goToMonth(year: number, month: number) {
		viewStartDate = new Date(year, month, 1);
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

	async function handleExportPDF() {
		try {
			await printQuarterCalendar(viewStartDate, {
				personnelByGroup,
				availabilityEntries,
				statusTypes,
				specialDays,
				assignmentTypes,
				assignments
			});
		} catch (err) {
			alert(err instanceof Error ? err.message : 'PDF export failed');
		}
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
		pickerYear={viewStartDate.getFullYear()}
		pickerMonth={viewStartDate.getMonth()}
		onSelectMonthYear={goToMonth}
	/>

	<div class="scroll-area">
		<div class="calendar-grid">
			<!-- Header Row with Months and Days -->
			<div class="grid-header">
				<div class="name-cell header-cell">Personnel</div>
				{#each months as month}
					<div
						class="month-header"
						style="width: {month.dates.length * COL_WIDTH}px; min-width: {month.dates.length * COL_WIDTH}px;"
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
						{@const dateKey = formatDate(date)}
						{@const weekend = isWeekend(date)}
						{@const today = isToday(date)}
						{@const special = specialDayByDate.get(dateKey)}
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
									{@const dateKey = formatDate(date)}
									{@const status = statusByPersonnelDate.get(`${person.id}:${dateKey}`)}
									{@const weekend = isWeekend(date)}
									{@const today = isToday(date)}
									{@const dutyBadges = dutyBadgesByPerson.get(person.id)?.get(dateKey) ?? []}
									<div
										class="status-cell"
										class:weekend
										class:today
										class:has-status={status}
										class:has-duty={dutyBadges.length > 0}
										style={status ? `background-color: ${status.color}` : ''}
										title={[status?.name, dutyBadges.map((b) => b.title).join(', ')].filter(Boolean).join(' | ')}
									>
										{#if status}
											<span class="status-dot"></span>
										{/if}
										{#if dutyBadges.length > 0}
											<span class="duty-indicator" style="background-color: {dutyBadges[0].color}"></span>
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
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					width="16"
					height="16"
					aria-hidden="true"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
				Excel
			</button>
			<button class="btn btn-secondary btn-sm" onclick={handleExportPDF} title="Print / PDF">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					width="16"
					height="16"
					aria-hidden="true"
				>
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
		--long-range-col-width: 24px;
		--long-range-header-height: 36px;
		flex: 1;
		display: flex;
		flex-direction: column;
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
	}

	.scroll-area {
		flex: 1;
		overflow: auto;
		scrollbar-gutter: stable;
		background: var(--surface-panel);
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
		background: color-mix(in srgb, var(--surface-subtle) 88%, var(--surface-panel) 12%);
		border-bottom: var(--border-thin);
	}

	.day-row {
		position: sticky;
		top: var(--long-range-header-height);
		z-index: 9;
		background: var(--surface-panel);
		border-bottom: var(--border-thin);
	}

	.name-cell {
		width: var(--personnel-column-width);
		min-width: var(--personnel-column-width);
		max-width: var(--personnel-column-width);
		flex-shrink: 0;
		position: sticky;
		left: 0;
		z-index: 2;
		background: var(--surface-panel);
		border-right: var(--border-thin);
		box-sizing: border-box;
	}

	.header-cell {
		display: flex;
		align-items: center;
		min-height: var(--long-range-header-height);
		padding: 7px 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: color-mix(in srgb, var(--surface-subtle) 90%, var(--surface-panel) 10%);
		color: var(--text-secondary);
		border-right-color: var(--border-default);
		z-index: 11;
	}

	.month-header {
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		min-height: var(--long-range-header-height);
		padding: 7px 0;
		background: color-mix(in srgb, var(--surface-subtle) 90%, var(--surface-panel) 10%);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border-left: var(--border-rule);
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.month-header:first-of-type {
		border-left: none;
	}

	.day-header-cell {
		padding: 0 12px;
		min-height: 32px;
		background: var(--surface-panel);
		z-index: 10;
	}

	.day-cell {
		appearance: none;
		border: none;
		width: var(--long-range-col-width);
		min-width: var(--long-range-col-width);
		max-width: var(--long-range-col-width);
		flex-shrink: 0;
		height: 32px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-size: var(--text-xs);
		border-left: var(--border-rule);
		background: var(--surface-panel);
		color: var(--text-secondary);
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.day-cell:hover {
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
	}

	.day-cell.weekend {
		background: color-mix(in srgb, var(--color-weekend) 56%, var(--surface-panel) 44%);
	}

	.day-cell.today {
		background: color-mix(in srgb, var(--amber-light) 54%, var(--surface-panel) 46%);
		box-shadow: inset 0 0 0 1px var(--amber);
		position: relative;
		z-index: 1;
	}

	.day-cell.holiday {
		background: color-mix(in srgb, var(--color-holiday) 78%, var(--surface-panel) 22%);
	}

	.day-num {
		font-family: var(--font-mono);
		font-weight: var(--font-weight-semibold);
		color: currentColor;
	}

	.group-row {
		background: color-mix(in srgb, var(--surface-subtle) 82%, var(--surface-panel) 18%);
	}

	.group-name {
		display: flex;
		align-items: center;
		min-height: 18px;
		padding: 0 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-subtle) 82%, var(--surface-panel) 18%);
	}

	.group-cell {
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		flex-shrink: 0;
		height: 18px;
		background: color-mix(in srgb, var(--surface-subtle) 82%, var(--surface-panel) 18%);
		border-left: var(--border-rule);
	}

	.person-row {
		border-bottom: var(--border-rule);
	}

	.person-row:hover .name-cell,
	.person-row:hover .status-cell:not(.has-status) {
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
	}

	.person-name {
		display: flex;
		align-items: center;
		min-height: 22px;
		padding: 0 12px;
		gap: var(--sp-1);
		font-size: var(--text-sm);
	}

	.person-name .rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.person-name .name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--text-primary);
	}

	.status-cell {
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		flex-shrink: 0;
		height: 22px;
		border-left: var(--border-rule);
		background: var(--surface-panel);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color var(--transition-fast);
		position: relative;
	}

	.status-cell.weekend {
		background: color-mix(in srgb, var(--color-weekend) 56%, var(--surface-panel) 44%);
	}

	.status-cell.today {
		box-shadow: inset 0 0 0 1px var(--amber);
		position: relative;
		z-index: 1;
	}

	.status-cell.has-status {
		border-color: transparent;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, var(--opacity-heavy));
	}

	.duty-indicator {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
	}

	/* Legend bar */
	.legend-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4) var(--sp-5);
		border-top: var(--border-thin);
		background: color-mix(in srgb, var(--surface-panel) 86%, var(--surface-subtle) 14%);
		flex-shrink: 0;
	}

	.legend {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		font-size: var(--text-sm);
		flex-wrap: wrap;
	}

	.legend-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 4px 8px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.legend-color {
		width: 8px;
		height: 8px;
		border-radius: 1px;
		box-shadow: inset 0 0 0 1px rgba(14, 14, 13, 0.08);
	}

	.legend-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.legend-bar {
			flex-wrap: wrap;
			padding: var(--sp-3) var(--sp-4);
		}

		.name-cell {
			font-size: var(--text-xs);
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
			font-size: var(--text-xs);
		}

		.person-name .rank {
			font-size: var(--text-xs);
		}

		.person-name .name {
			font-size: var(--text-xs);
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
			gap: var(--sp-2);
		}
	}
</style>
