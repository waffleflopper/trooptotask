<script lang="ts">
	import type { Personnel, AvailabilityEntry, StatusType, SpecialDay } from '../types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths, isToday } from '../utils/dates';
	import { exportQuarterToCSV, printQuarterCalendar } from '../utils/calendarExport';

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
		onClose: () => void;
		onCellClick?: (person: Personnel, date: Date) => void;
	}

	let { startDate, personnelByGroup, availabilityEntries, statusTypes, specialDays, assignmentTypes, assignments, onClose, onCellClick }: Props = $props();

	let viewStartDate = $state(new Date(startDate.getFullYear(), startDate.getMonth(), 1));

	// Get 3 months of data
	const months = $derived(() => {
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

	const allPersonnel = $derived(personnelByGroup.flatMap(g => g.personnel));

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
			e => e.personnelId === personnelId && dateStr >= e.startDate && dateStr <= e.endDate
		);
		if (!entry) return null;
		return statusTypes.find(s => s.id === entry.statusTypeId) ?? null;
	}

	function getSpecialDay(date: Date): SpecialDay | null {
		const dateStr = formatDate(date);
		return specialDays.find(s => s.date === dateStr) ?? null;
	}

	function getAssignmentBadges(date: Date): { shortName: string; color: string }[] {
		const dateStr = formatDate(date);
		const dayAssignments = assignments.filter(a => a.date === dateStr);
		return dayAssignments.map(a => {
			const type = assignmentTypes.find(t => t.id === a.assignmentTypeId);
			return type ? { shortName: type.shortName, color: type.color } : null;
		}).filter((b): b is { shortName: string; color: string } => b !== null);
	}

	function handleCellClick(person: Personnel, date: Date) {
		onCellClick?.(person, date);
	}

	// Stats
	const totalDays = $derived(months().reduce((sum, m) => sum + m.dates.length, 0));

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

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="longrange-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal long-range-modal" role="document">
		<div class="modal-header">
			<h2 id="longrange-title">Long Range View</h2>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<div class="nav-bar">
			<button class="btn btn-secondary btn-sm" onclick={prevQuarter}>
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
				</svg>
				Prev 3 Months
			</button>
			<div class="date-range">
				{months()[0].name} {months()[0].year} – {months()[2].name} {months()[2].year}
			</div>
			<button class="btn btn-secondary btn-sm" onclick={goToToday}>Today</button>
			<button class="btn btn-secondary btn-sm" onclick={nextQuarter}>
				Next 3 Months
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
				</svg>
			</button>
			<div class="export-buttons">
				<button class="btn btn-secondary btn-sm" onclick={handleExportCSV} title="Export to Excel">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
					Excel
				</button>
				<button class="btn btn-secondary btn-sm" onclick={handleExportPDF} title="Print / PDF">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
						<path d="M6 9V2h12v7" />
						<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
						<rect x="6" y="14" width="12" height="8" />
					</svg>
					PDF
				</button>
			</div>
		</div>

		<div class="modal-body">
			<div class="calendar-grid">
				<!-- Header Row with Months and Days -->
				<div class="grid-header">
					<div class="name-cell header-cell">Personnel</div>
					{#each months() as month}
						<div class="month-header" style="width: {month.dates.length * 24}px; min-width: {month.dates.length * 24}px;">
							{month.name} {month.year}
						</div>
					{/each}
				</div>

				<!-- Day Numbers Row -->
				<div class="day-row">
					<div class="name-cell day-header-cell"></div>
					{#each months() as month}
						{#each month.dates as date}
							{@const weekend = isWeekend(date)}
							{@const today = isToday(date)}
							{@const special = getSpecialDay(date)}
							{@const badges = getAssignmentBadges(date)}
							<div
								class="day-cell"
								class:weekend
								class:today
								class:holiday={special?.type === 'federal-holiday'}
								title={special?.name ?? ''}
							>
								<span class="day-num">{date.getDate()}</span>
								{#if badges.length > 0}
									<div class="day-badges">
										{#each badges as badge}
											<span class="mini-badge" style="background-color: {badge.color}" title={badge.shortName}></span>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					{/each}
				</div>

				<!-- Personnel Rows -->
				{#each personnelByGroup as grp}
					{#if grp.personnel.length > 0}
						<!-- Group Header -->
						<div class="group-row">
							<div class="name-cell group-name">{grp.group}</div>
							{#each months() as month}
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
								{#each months() as month}
									{#each month.dates as date}
										{@const status = getStatusForDate(person.id, date)}
										{@const weekend = isWeekend(date)}
										{@const today = isToday(date)}
										<button
											class="status-cell"
											class:weekend
											class:today
											class:has-status={status}
											style={status ? `background-color: ${status.color}` : ''}
											title={status?.name ?? ''}
											onclick={() => handleCellClick(person, date)}
										>
											{#if status}
												<span class="status-dot"></span>
											{/if}
										</button>
									{/each}
								{/each}
							</div>
						{/each}
					{/if}
				{/each}
			</div>
		</div>

		<div class="modal-footer">
			<div class="legend">
				<span class="legend-label">Status:</span>
				{#each statusTypes as status}
					<span class="legend-item">
						<span class="legend-color" style="background-color: {status.color}"></span>
						{status.name}
					</span>
				{/each}
			</div>
			<button class="btn btn-primary" onclick={onClose}>Close</button>
		</div>
	</div>
</div>

<style>
	.long-range-modal {
		width: 95vw;
		max-width: 1400px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.close-btn {
		font-size: 1.25rem;
		line-height: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.nav-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: #0F0F0F;
		color: #F0EDE6;
	}

	.nav-bar .btn-secondary {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: #F0EDE6;
	}

	.nav-bar .btn-secondary:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.date-range {
		font-size: var(--font-size-lg);
		font-weight: 600;
		min-width: 300px;
		text-align: center;
	}

	.export-buttons {
		display: flex;
		gap: var(--spacing-xs);
		margin-left: var(--spacing-md);
		padding-left: var(--spacing-md);
		border-left: 1px solid #2A2A2A;
	}

	.modal-body {
		flex: 1;
		overflow: auto;
		padding: 0;
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
		width: 140px;
		min-width: 140px;
		max-width: 140px;
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
		background: #0F0F0F;
		color: #F0EDE6;
		border-right-color: #0F0F0F;
		z-index: 11;
	}

	.month-header {
		text-align: center;
		padding: var(--spacing-xs);
		background: #0F0F0F;
		color: #F0EDE6;
		font-weight: 600;
		font-size: var(--font-size-sm);
		border-left: 1px solid #2A2A2A;
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

	.day-badges {
		display: flex;
		gap: 1px;
		margin-top: 1px;
	}

	.mini-badge {
		width: 4px;
		height: 4px;
		border-radius: 50%;
	}

	.group-row {
		background: #0F0F0F;
	}

	.group-name {
		font-weight: 600;
		font-size: var(--font-size-sm);
		color: #F0EDE6;
		background: #0F0F0F;
	}

	.group-cell {
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		flex-shrink: 0;
		height: 20px;
		background: #0F0F0F;
		border-left: 1px solid #2A2A2A;
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
		cursor: pointer;
		transition: all 0.1s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-cell:hover {
		opacity: 0.8;
		transform: scale(1.1);
		z-index: 1;
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

	/* Footer */
	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
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

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.long-range-modal {
			width: 100vw;
			max-width: 100vw;
			height: 100vh;
			max-height: 100vh;
			border-radius: 0;
		}

		.nav-bar {
			flex-wrap: wrap;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.date-range {
			font-size: var(--font-size-base);
			min-width: unset;
			order: -1;
			width: 100%;
		}

		.export-buttons {
			margin-left: 0;
			padding-left: 0;
			border-left: none;
		}

		.name-cell {
			width: 100px;
			min-width: 100px;
			max-width: 100px;
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

		.modal-footer {
			justify-content: flex-end;
			padding: var(--spacing-sm) var(--spacing-md);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.long-range-modal {
			width: 98vw;
			max-width: 98vw;
		}

		.name-cell {
			width: 120px;
			min-width: 120px;
			max-width: 120px;
		}

		.legend {
			flex-wrap: wrap;
			gap: var(--spacing-sm);
		}
	}
</style>
