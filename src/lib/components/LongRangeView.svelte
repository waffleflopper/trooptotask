<script lang="ts">
	import type { Personnel, AvailabilityEntry, StatusType, SpecialDay } from '../types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths, isToday } from '../utils/dates';

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
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<div class="modal long-range-modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h2>Long Range View</h2>
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
							<div class="name-cell group-name">{grp.group || 'Unassigned'}</div>
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
		background: var(--color-primary);
		color: white;
	}

	.nav-bar .btn-secondary {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: white;
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
		background: var(--color-primary);
		color: white;
		border-right-color: var(--color-primary);
		z-index: 11;
	}

	.month-header {
		text-align: center;
		padding: var(--spacing-xs);
		background: var(--color-primary);
		color: white;
		font-weight: 600;
		font-size: var(--font-size-sm);
		border-left: 1px solid rgba(255, 255, 255, 0.2);
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
		background: var(--color-bg);
	}

	.group-name {
		font-weight: 600;
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		background: var(--color-bg);
	}

	.group-cell {
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		flex-shrink: 0;
		height: 20px;
		background: var(--color-bg);
		border-left: 1px solid var(--color-border);
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
</style>
