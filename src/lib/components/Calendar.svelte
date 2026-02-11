<script lang="ts">
	import type { Personnel, AvailabilityEntry, StatusType, SpecialDay } from '../types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import CalendarHeader from './CalendarHeader.svelte';
	import PersonnelRow from './PersonnelRow.svelte';
	import GroupHeader from './GroupHeader.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		year: number;
		monthName: string;
		dates: Date[];
		personnelByGroup: GroupData[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		specialDays: SpecialDay[];
		pinnedGroups: string[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		canEdit?: boolean;
		onPrevMonth: () => void;
		onNextMonth: () => void;
		onGoToToday: () => void;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
		onPinToggle?: (group: string) => void;
		onDateClick?: (date: Date) => void;
	}

	let {
		year,
		monthName,
		dates,
		personnelByGroup,
		availabilityEntries,
		statusTypes,
		specialDays,
		pinnedGroups,
		assignmentTypes,
		assignments,
		canEdit = true,
		onPrevMonth,
		onNextMonth,
		onGoToToday,
		onCellClick,
		onPersonClick,
		onPinToggle,
		onDateClick
	}: Props = $props();

	let collapsedGroups = $state<Set<string>>(new Set());
	let scrollLeft = $state(0);
	let calendarBodyEl: HTMLDivElement;

	function handleScroll() {
		if (calendarBodyEl) {
			scrollLeft = calendarBodyEl.scrollLeft;
		}
	}

	function toggleGroup(group: string) {
		const newSet = new Set(collapsedGroups);
		if (newSet.has(group)) {
			newSet.delete(group);
		} else {
			newSet.add(group);
		}
		collapsedGroups = newSet;
	}

	const totalPersonnel = $derived(
		personnelByGroup.reduce((sum, g) => sum + g.personnel.length, 0)
	);
</script>

<div class="calendar">
	<CalendarHeader
		{year}
		{monthName}
		{dates}
		{specialDays}
		{assignmentTypes}
		{assignments}
		{onPrevMonth}
		{onNextMonth}
		{onGoToToday}
		onDateClick={canEdit ? onDateClick : undefined}
		{scrollLeft}
	/>

	<div class="calendar-body" style="--dates-count: {dates.length};" bind:this={calendarBodyEl} onscroll={handleScroll}>
		{#if totalPersonnel === 0}
			<div class="empty-state">
				<p>No personnel added yet.</p>
				<p>Go to Personnel to add people to your roster.</p>
			</div>
		{:else}
			{#each personnelByGroup as grp (grp.group)}
				<GroupHeader
					groupName={grp.group}
					isCollapsed={collapsedGroups.has(grp.group)}
					isPinned={pinnedGroups.includes(grp.group)}
					onToggle={() => toggleGroup(grp.group)}
					onPinToggle={() => onPinToggle?.(grp.group)}
				/>
				{#if !collapsedGroups.has(grp.group)}
					{#each grp.personnel as person (person.id)}
						<PersonnelRow
							{person}
							{dates}
							{availabilityEntries}
							{statusTypes}
							{specialDays}
							{assignmentTypes}
							{assignments}
							onCellClick={canEdit ? onCellClick : undefined}
							{onPersonClick}
						/>
					{/each}
				{/if}
			{/each}
		{/if}
	</div>
</div>

<style>
	.calendar {
		flex: 1;
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.calendar-body {
		flex: 1;
		overflow: auto;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
		text-align: center;
		min-height: 200px;
	}

	.empty-state p {
		margin: var(--spacing-xs) 0;
	}
</style>
