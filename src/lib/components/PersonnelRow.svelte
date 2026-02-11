<script lang="ts">
	import type { Personnel, AvailabilityEntry, StatusType, SpecialDay } from '../types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import { isWeekend, isToday, formatDate } from '../utils/dates';
	import DateCell from './DateCell.svelte';

	interface Props {
		person: Personnel;
		dates: Date[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		specialDays: SpecialDay[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		showStatusText?: boolean;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
	}

	let {
		person,
		dates,
		availabilityEntries,
		statusTypes,
		specialDays,
		assignmentTypes,
		assignments,
		showStatusText = false,
		onCellClick,
		onPersonClick
	}: Props = $props();

	function getEntriesForDate(date: Date): AvailabilityEntry[] {
		const dateStr = formatDate(date);
		return availabilityEntries.filter(
			(e) => e.personnelId === person.id && dateStr >= e.startDate && dateStr <= e.endDate
		);
	}

	function getSpecialDay(date: Date): SpecialDay | undefined {
		const dateStr = formatDate(date);
		return specialDays.find((d) => d.date === dateStr);
	}

	function getAssignmentsForDate(date: Date): { type: AssignmentType; assignment: DailyAssignment }[] {
		const dateStr = formatDate(date);
		return assignments
			.filter((a) => a.date === dateStr && a.assigneeId === person.id)
			.map((a) => {
				const type = assignmentTypes.find((t) => t.id === a.assignmentTypeId && t.assignTo === 'personnel');
				return type ? { type, assignment: a } : null;
			})
			.filter((a): a is { type: AssignmentType; assignment: DailyAssignment } => a !== null);
	}

	function handleCellClick(date: Date) {
		onCellClick?.(person, date);
	}

	function handlePersonClick() {
		onPersonClick?.(person);
	}
</script>

<div class="personnel-row">
	<button class="personnel-info" onclick={handlePersonClick}>
		<span class="rank">{person.rank}</span>
		<div class="name-block">
			<span class="name">{person.lastName}, {person.firstName}</span>
			{#if person.clinicRole}
				<span class="role">{person.clinicRole}</span>
			{/if}
		</div>
	</button>
	<div class="date-cells">
		{#each dates as date (formatDate(date))}
			{@const specialDay = getSpecialDay(date)}
			{@const dateAssignments = getAssignmentsForDate(date)}
			<DateCell
				{date}
				isWeekend={isWeekend(date)}
				isToday={isToday(date)}
				isHoliday={!!specialDay}
				holidayName={specialDay?.name}
				entries={getEntriesForDate(date)}
				{statusTypes}
				assignments={dateAssignments}
				{showStatusText}
				onclick={() => handleCellClick(date)}
			/>
		{/each}
	</div>
</div>

<style>
	.personnel-row {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid var(--color-border);
	}

	.personnel-row:last-child {
		border-bottom: none;
	}

	.personnel-info {
		width: var(--personnel-column-width);
		min-width: var(--personnel-column-width);
		padding: var(--spacing-xs) var(--spacing-sm);
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		position: sticky;
		left: 0;
		z-index: 2;
		text-align: left;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.personnel-info:hover {
		background-color: var(--color-bg);
	}

	.rank {
		font-weight: 600;
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		min-width: 35px;
		padding-top: 1px;
	}

	.name-block {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	.name {
		font-size: var(--font-size-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text);
	}

	.role {
		font-size: 10px;
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.date-cells {
		display: flex;
		flex: 1;
		align-items: stretch;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.personnel-info {
			width: var(--personnel-column-width);
			min-width: var(--personnel-column-width);
			padding: var(--spacing-xs);
		}

		.rank {
			font-size: var(--font-size-xs);
			min-width: 28px;
		}

		.name {
			font-size: var(--font-size-xs);
		}

		.role {
			display: none; /* Hide on mobile to save space */
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.personnel-info {
			width: var(--personnel-column-width);
			min-width: var(--personnel-column-width);
		}

		.role {
			font-size: 9px;
		}
	}
</style>
