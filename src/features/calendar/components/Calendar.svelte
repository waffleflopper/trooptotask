<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry, StatusType, SpecialDay } from '$features/calendar/calendar.types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import CalendarHeader from './CalendarHeader.svelte';
	import PersonnelRow from '$features/personnel/components/PersonnelRow.svelte';
	import GroupHeader from '$lib/components/GroupHeader.svelte';

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
		activeOnboardingPersonnelIds?: string[];
		highlightOnboarding?: boolean;
		canEdit?: boolean;
		showStatusText?: boolean;
		onPrevMonth: () => void;
		onNextMonth: () => void;
		onGoToToday: () => void;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
		onPinToggle?: (group: string) => void;
		onDateClick?: (date: Date) => void;
		personnelHref?: string;
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
		activeOnboardingPersonnelIds = [],
		highlightOnboarding = true,
		canEdit = true,
		showStatusText = false,
		onPrevMonth,
		onNextMonth,
		onGoToToday,
		onCellClick,
		onPersonClick,
		onPinToggle,
		onDateClick,
		personnelHref
	}: Props = $props();

	let collapsedGroups = $state<Set<string>>(new Set());
	let scrollLeft = $state(0);
	let scrollbarWidth = $state(0);
	let calendarBodyEl: HTMLDivElement;

	function handleScroll() {
		if (calendarBodyEl) {
			scrollLeft = calendarBodyEl.scrollLeft;
			// Drive the personnel column position via CSS custom property (more reliable than position: sticky on mobile)
			calendarBodyEl.style.setProperty('--scroll-left', `${scrollLeft}px`);
			// Calculate scrollbar width (difference between outer and inner width)
			const newScrollbarWidth = calendarBodyEl.offsetWidth - calendarBodyEl.clientWidth;
			if (newScrollbarWidth !== scrollbarWidth) {
				scrollbarWidth = newScrollbarWidth;
			}
		}
	}

	// Initial measurement after mount
	$effect(() => {
		if (calendarBodyEl) {
			scrollbarWidth = calendarBodyEl.offsetWidth - calendarBodyEl.clientWidth;
			calendarBodyEl.style.setProperty('--scroll-left', `${calendarBodyEl.scrollLeft}px`);
		}
	});

	function toggleGroup(group: string) {
		const newSet = new Set(collapsedGroups);
		if (newSet.has(group)) {
			newSet.delete(group);
		} else {
			newSet.add(group);
		}
		collapsedGroups = newSet;
	}

	const onboardingSet = $derived(new Set(activeOnboardingPersonnelIds));

	const totalPersonnel = $derived(
		personnelByGroup.reduce((sum, g) => sum + g.personnel.length, 0)
	);

	// Pre-index availability entries by personnel ID for O(1) lookup per person
	const availabilityByPerson = $derived.by(() => {
		const map = new Map<string, AvailabilityEntry[]>();
		for (const e of availabilityEntries) {
			let list = map.get(e.personnelId);
			if (!list) {
				list = [];
				map.set(e.personnelId, list);
			}
			list.push(e);
		}
		return map;
	});

	// Pre-index assignments by assignee ID
	const assignmentsByPerson = $derived.by(() => {
		const map = new Map<string, DailyAssignment[]>();
		for (const a of assignments) {
			let list = map.get(a.assigneeId);
			if (!list) {
				list = [];
				map.set(a.assigneeId, list);
			}
			list.push(a);
		}
		return map;
	});

	// Pre-index status types by ID for O(1) lookup
	const statusTypeMap = $derived.by(() => {
		const map = new Map<string, StatusType>();
		for (const s of statusTypes) {
			map.set(s.id, s);
		}
		return map;
	});
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
		{scrollbarWidth}
	/>

	<div class="calendar-body" style="--dates-count: {dates.length};" bind:this={calendarBodyEl} onscroll={handleScroll}>
		{#if totalPersonnel === 0}
			<div class="empty-state">
				<p>No personnel added yet.</p>
				{#if personnelHref}
					<a class="btn btn-primary btn-sm" href={personnelHref}>Go to Personnel</a>
				{:else}
					<p>Go to Personnel to add people to your roster.</p>
				{/if}
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
							personAvailability={availabilityByPerson.get(person.id) ?? []}
							{statusTypeMap}
							{specialDays}
							{assignmentTypes}
							personAssignments={assignmentsByPerson.get(person.id) ?? []}
							{showStatusText}
							isOnboarding={onboardingSet.has(person.id)}
							{highlightOnboarding}
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
