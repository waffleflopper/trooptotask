<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry, StatusType, SpecialDay } from '$features/calendar/calendar.types';
	import type { AssignmentType, DailyAssignment } from '$features/calendar/stores/dailyAssignments.svelte';
	import { isWeekend, isToday, formatDate } from '$lib/utils/dates';
	import DateCell from '$lib/components/ui/DateCell.svelte';

	interface Props {
		person: Personnel;
		dates: Date[];
		personAvailability: AvailabilityEntry[];
		statusTypeMap: Map<string, StatusType>;
		specialDays: SpecialDay[];
		assignmentTypes: AssignmentType[];
		personAssignments: DailyAssignment[];
		showStatusText?: boolean;
		isOnboarding?: boolean;
		highlightOnboarding?: boolean;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
	}

	let {
		person,
		dates,
		personAvailability,
		statusTypeMap,
		specialDays,
		assignmentTypes,
		personAssignments,
		showStatusText = false,
		isOnboarding = false,
		highlightOnboarding = true,
		onCellClick,
		onPersonClick
	}: Props = $props();

	// Build date-keyed index of availability entries for this person (once per render)
	const availabilityByDate = $derived.by(() => {
		const map = new Map<string, AvailabilityEntry[]>();
		for (const entry of personAvailability) {
			// Expand entry across its date range for the visible dates
			for (const date of dates) {
				const dateStr = formatDate(date);
				if (dateStr >= entry.startDate && dateStr <= entry.endDate) {
					let list = map.get(dateStr);
					if (!list) {
						list = [];
						map.set(dateStr, list);
					}
					list.push(entry);
				}
			}
		}
		return map;
	});

	// Build date-keyed index of assignments for this person
	const assignmentsByDate = $derived.by(() => {
		const map = new Map<string, { type: AssignmentType; assignment: DailyAssignment }[]>();
		for (const a of personAssignments) {
			const type = assignmentTypes.find((t) => t.id === a.assignmentTypeId && t.assignTo === 'personnel');
			if (!type) continue;
			let list = map.get(a.date);
			if (!list) {
				list = [];
				map.set(a.date, list);
			}
			list.push({ type, assignment: a });
		}
		return map;
	});

	// Build date-keyed index of special days
	const specialDayMap = $derived.by(() => {
		const map = new Map<string, SpecialDay>();
		for (const d of specialDays) {
			map.set(d.date, d);
		}
		return map;
	});

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
			<span class="name-line">
				<span class="name">{person.lastName}, {person.firstName}</span>
				{#if isOnboarding}
					<span class="onboarding-dot" title="Active onboarding"></span>
				{/if}
			</span>
			{#if person.clinicRole}
				<span class="role">{person.clinicRole}</span>
			{/if}
		</div>
	</button>
	<div class="date-cells">
		{#each dates as date (formatDate(date))}
			{@const dateStr = formatDate(date)}
			{@const specialDay = specialDayMap.get(dateStr)}
			<DateCell
				{date}
				isWeekend={isWeekend(date)}
				isToday={isToday(date)}
				isHoliday={!!specialDay}
				holidayName={specialDay?.name}
				entries={availabilityByDate.get(dateStr) ?? []}
				{statusTypeMap}
				assignments={assignmentsByDate.get(dateStr) ?? []}
				{showStatusText}
				isOnboarding={isOnboarding && highlightOnboarding}
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
		transform: translateX(var(--scroll-left, 0px));
		z-index: 2;
		text-align: left;
		cursor: pointer;
		will-change: transform;
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

	.name-line {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}

	.name {
		font-size: var(--font-size-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text);
	}

	.onboarding-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #b8943e;
		flex-shrink: 0;
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
