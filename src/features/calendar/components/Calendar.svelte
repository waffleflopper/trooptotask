<script lang="ts">
	import type {
		Personnel,
		AvailabilityEntry,
		StatusType,
		SpecialDay,
		AssignmentType,
		DailyAssignment
	} from '$lib/types';
	import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
	import type { UpcomingLossRecord } from '$features/dashboard/utils/evaluateUpcomingLosses';
	import CalendarHeader from './CalendarHeader.svelte';
	import CalendarRow from './CalendarRow.svelte';
	import GroupHeader from '$lib/components/GroupHeader.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';
	import { buildDutyEventBadgesByPerson, type DutyEventBadge } from '$features/calendar/utils/dutyEventBadges';
	import { buildVirtualRowLayout, getVisibleVirtualRows } from '$features/calendar/utils/virtualRows';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	const GROUP_ROW_HEIGHT = 35;
	const PERSON_ROW_HEIGHT_WITH_ROLES = 46;
	const PERSON_ROW_HEIGHT_WITHOUT_ROLES = 36;
	const DEFAULT_VIEWPORT_HEIGHT = 720;
	const ROW_OVERSCAN_COUNT = 8;

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		year: number;
		month: number;
		monthName: string;
		dates: Date[];
		personnelByGroup: GroupData[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		specialDays: SpecialDay[];
		pinnedGroups: string[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		dutyEvents?: DutyEvent[];
		dutyStartDayOnly?: boolean;
		activeOnboardingPersonnelIds?: string[];
		highlightOnboarding?: boolean;
		canEdit?: boolean;
		showStatusText?: boolean;
		showPersonnelRoles?: boolean;
		/** Map of personId → UpcomingLossRecord for per-row loss indicators. */
		upcomingLossMap?: Map<string, UpcomingLossRecord>;
		onPrevMonth: () => void;
		onNextMonth: () => void;
		onGoToToday: () => void;
		onNavigateToMonth?: (year: number, month: number) => void;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
		onPinToggle?: (group: string) => void;
		onDateClick?: (date: Date) => void;
		personnelHref?: string;
		viewMode?: 'month' | '3-month';
		onToggleViewMode?: () => void;
	}

	let {
		year,
		month,
		monthName,
		dates,
		personnelByGroup,
		availabilityEntries,
		statusTypes,
		specialDays,
		pinnedGroups,
		assignmentTypes,
		assignments,
		dutyEvents = [],
		dutyStartDayOnly = true,
		activeOnboardingPersonnelIds = [],
		highlightOnboarding = true,
		canEdit = true,
		showStatusText = false,
		showPersonnelRoles = false,
		upcomingLossMap,
		onPrevMonth,
		onNextMonth,
		onGoToToday,
		onNavigateToMonth,
		onCellClick,
		onPersonClick,
		onPinToggle,
		onDateClick,
		personnelHref,
		viewMode = 'month',
		onToggleViewMode
	}: Props = $props();

	const collapsedGroups = new SvelteSet<string>();
	let scrollLeft = $state(0);
	let scrollTop = $state(0);
	let scrollbarWidth = $state(0);
	let viewportHeight = $state(DEFAULT_VIEWPORT_HEIGHT);
	let calendarBodyEl: HTMLDivElement;

	function updateScrollMetrics() {
		if (!calendarBodyEl) return;

		scrollLeft = calendarBodyEl.scrollLeft;
		scrollTop = calendarBodyEl.scrollTop;
		viewportHeight = calendarBodyEl.clientHeight || DEFAULT_VIEWPORT_HEIGHT;
	}

	function updateScrollbarWidth() {
		if (!calendarBodyEl) return;

		const newScrollbarWidth = calendarBodyEl.offsetWidth - calendarBodyEl.clientWidth;
		if (newScrollbarWidth !== scrollbarWidth) {
			scrollbarWidth = newScrollbarWidth;
		}
	}

	function updateCalendarMetrics() {
		updateScrollMetrics();
		updateScrollbarWidth();
	}

	function handleScroll() {
		updateCalendarMetrics();
	}

	$effect(() => {
		if (!calendarBodyEl) return;

		updateCalendarMetrics();

		if (typeof ResizeObserver === 'undefined') return;

		const observer = new ResizeObserver(() => {
			updateCalendarMetrics();
		});
		observer.observe(calendarBodyEl);

		return () => observer.disconnect();
	});

	function toggleGroup(group: string) {
		if (collapsedGroups.has(group)) {
			collapsedGroups.delete(group);
		} else {
			collapsedGroups.add(group);
		}
	}

	const onboardingSet = $derived(new SvelteSet(activeOnboardingPersonnelIds));

	const totalPersonnel = $derived(personnelByGroup.reduce((sum, g) => sum + g.personnel.length, 0));
	const personRowHeight = $derived(showPersonnelRoles ? PERSON_ROW_HEIGHT_WITH_ROLES : PERSON_ROW_HEIGHT_WITHOUT_ROLES);
	const rowOverscanPx = $derived(personRowHeight * ROW_OVERSCAN_COUNT);

	const rosterRows = $derived.by(() => {
		const rows: (
			| { type: 'group'; key: string; group: string; height: number }
			| { type: 'person'; key: string; person: Personnel; height: number }
		)[] = [];

		for (const grp of personnelByGroup) {
			rows.push({
				type: 'group',
				key: `group:${grp.group}`,
				group: grp.group,
				height: GROUP_ROW_HEIGHT
			});

			if (collapsedGroups.has(grp.group)) continue;

			for (const person of grp.personnel) {
				rows.push({
					type: 'person',
					key: `person:${person.id}`,
					person,
					height: personRowHeight
				});
			}
		}

		return rows;
	});

	const rosterLayout = $derived.by(() => buildVirtualRowLayout(rosterRows));

	const visibleRosterRows = $derived.by(() =>
		getVisibleVirtualRows(rosterLayout.rows, scrollTop, viewportHeight, rowOverscanPx)
	);

	// Pre-index availability entries by personnel ID for O(1) lookup per person
	const availabilityByPerson = $derived.by(() => {
		const map = new SvelteMap<string, AvailabilityEntry[]>();
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
		const map = new SvelteMap<string, DailyAssignment[]>();
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

	// Pre-index advanced-duty-event badges by personnel ID → date string
	const dutyBadgesByPerson = $derived.by(() =>
		buildDutyEventBadgesByPerson(dutyEvents, { startDayOnly: dutyStartDayOnly })
	);

	const personnelById = $derived.by(() => {
		const map = new SvelteMap<string, Personnel>();
		for (const group of personnelByGroup) {
			for (const person of group.personnel) {
				map.set(person.id, person);
			}
		}
		return map;
	});

	// Pre-index status types by ID for O(1) lookup
	const statusTypeMap = $derived.by(() => {
		const map = new SvelteMap<string, StatusType>();
		for (const s of statusTypes) {
			map.set(s.id, s);
		}
		return map;
	});
</script>

<div class="calendar flex flex-1 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground">
	<CalendarHeader
		{year}
		{month}
		{monthName}
		{dates}
		{specialDays}
		{assignmentTypes}
		{assignments}
		{personnelById}
		{onPrevMonth}
		{onNextMonth}
		{onGoToToday}
		{onNavigateToMonth}
		onDateClick={canEdit ? onDateClick : undefined}
		{scrollLeft}
		{scrollbarWidth}
		{viewMode}
		{onToggleViewMode}
	/>

	<div
		class="calendar-body flex-1 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
		style="
			--dates-count: {dates.length};
			--calendar-group-row-height: {GROUP_ROW_HEIGHT}px;
			--calendar-person-row-height: {personRowHeight}px;
		"
		bind:this={calendarBodyEl}
		onscroll={handleScroll}
	>
		<div class="calendar-grid flex min-h-full min-w-full flex-col">
			{#if totalPersonnel === 0}
				<Empty.Root class="min-h-52 border-0">
					<Empty.Header>
						<Empty.Title>No personnel added yet</Empty.Title>
						<Empty.Description>Go to Personnel to add people to your roster.</Empty.Description>
					</Empty.Header>
					{#if personnelHref}
						<Empty.Content>
							<Button href={personnelHref} size="sm">Go to Personnel</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<div
					class="calendar-rows relative min-w-[calc(var(--personnel-column-width)+(var(--cell-width)*var(--dates-count)))]"
					style:height={`${rosterLayout.totalHeight}px`}
				>
					{#each visibleRosterRows as row (row.key)}
						<div
							class={[
								'virtual-row absolute top-0 left-0 w-full overflow-hidden',
								row.type === 'person' && 'virtual-row--person',
								row.type === 'group' && 'virtual-row--group'
							]}
							style:transform={`translateY(${row.top}px)`}
							style:height={`${row.height}px`}
						>
							{#if row.type === 'group'}
								<GroupHeader
									groupName={row.group}
									isCollapsed={collapsedGroups.has(row.group)}
									isPinned={pinnedGroups.includes(row.group)}
									onToggle={() => toggleGroup(row.group)}
									onPinToggle={() => onPinToggle?.(row.group)}
								/>
							{:else}
								<CalendarRow
									person={row.person}
									{dates}
									personAvailability={availabilityByPerson.get(row.person.id) ?? []}
									{statusTypeMap}
									{specialDays}
									{assignmentTypes}
									personAssignments={assignmentsByPerson.get(row.person.id) ?? []}
									personDutyBadges={dutyBadgesByPerson.get(row.person.id) ?? new SvelteMap<string, DutyEventBadge[]>()}
									{showStatusText}
									{showPersonnelRoles}
									isOnboarding={onboardingSet.has(row.person.id)}
									{highlightOnboarding}
									upcomingLossRecord={upcomingLossMap?.get(row.person.id)}
									onCellClick={canEdit ? onCellClick : undefined}
									{onPersonClick}
								/>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
