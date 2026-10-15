<script lang="ts">
	import type { Personnel } from '$features/personnel/contracts';
	import type { AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from '$features/calendar/contracts';
	import type { UpcomingLossRecord } from '$features/personnel/contracts';
	import type { CalendarLane } from '$features/calendar/utils/calendarLanes';
	import CalendarHeader from './CalendarHeader.svelte';
	import CalendarRow from './CalendarRow.svelte';
	import GroupHeader from './GroupHeader.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';
	import type { AvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
	import { dayWindow, fromDayNumber, toDayNumber, type DayNumber } from '$features/calendar/utils/dayNumber';
	import { layoutBars, type Bar, type LabelPolicy } from '$features/calendar/utils/barLayout';
	import { gestureRange } from '$features/calendar/utils/calendarGesture';
	import { CalendarGesture, type GestureCommit } from './calendar-bars/gesture.svelte';
	import { buildCalendarDays, buildDutyMarkers } from '$features/calendar/utils/calendarRenderState';
	import { buildVirtualRowLayout, getVisibleVirtualRows } from '$features/calendar/utils/virtualRows';
	import { SvelteSet } from 'svelte/reactivity';

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
		tracks: AvailabilityTracks;
		specialDays: SpecialDay[];
		pinnedGroups: string[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		lanes?: readonly CalendarLane[];
		activeOnboardingPersonnelIds?: string[];
		highlightOnboarding?: boolean;
		canEdit?: boolean;
		canEditAssignments?: boolean;
		showStatusText?: boolean;
		showPersonnelRoles?: boolean;
		/** Map of personId → UpcomingLossRecord for per-row loss indicators. */
		upcomingLossMap?: ReadonlyMap<string, UpcomingLossRecord>;
		onPrevMonth: () => void;
		onNextMonth: () => void;
		onGoToToday: () => void;
		onNavigateToMonth?: (year: number, month: number) => void;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
		onPinToggle?: (group: string) => void;
		onDateClick?: (date: Date) => void;
		/** Opens the assignments for a marked date. Without it, row markers are not interactive. */
		onMarkerClick?: (date: Date) => void;
		onOpenEntry?: (person: Personnel, entry: AvailabilityEntry, anchor: HTMLElement) => void;
		onOpenOverflow?: (person: Personnel, entryIds: readonly string[], anchor: HTMLElement) => void;
		canEditAvailabilityFor?: (person: Personnel) => boolean;
		popoverEntry?: { personId: string; entryId: string } | null;
		quickAddSelection?: { personId: string; startDate: string; endDate: string } | null;
		/** A change is settling; no new drag starts until it does. */
		saving?: boolean;
		onQuickAdd?: (person: Personnel, startDate: string, endDate: string, anchor: HTMLElement) => void;
		onResize?: (person: Personnel, entry: AvailabilityEntry, startDate: string, endDate: string) => void;
		personnelHref?: string;
	}

	let {
		year,
		month,
		monthName,
		dates,
		personnelByGroup,
		tracks,
		specialDays,
		pinnedGroups,
		assignmentTypes,
		assignments,
		lanes = [],
		activeOnboardingPersonnelIds = [],
		highlightOnboarding = true,
		canEdit = true,
		canEditAssignments = canEdit,
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
		onMarkerClick,
		onOpenEntry,
		onOpenOverflow,
		canEditAvailabilityFor = () => canEdit,
		popoverEntry = null,
		quickAddSelection = null,
		saving = false,
		onQuickAdd,
		onResize,
		personnelHref
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

	const days = $derived(buildCalendarDays(dates, specialDays));
	const visibleDays = $derived(dayWindow(days[0]?.dateKey ?? '1970-01-01', days.length));
	const policy: LabelPolicy = $derived({ view: 'month', showStatusText });
	const markersByPerson = $derived(
		buildDutyMarkers(
			assignments,
			assignmentTypes,
			days.map((day) => day.dateKey)
		)
	);
	const onboardingIds = $derived(new Set(activeOnboardingPersonnelIds));

	const gesture = new CalendarGesture();
	const dragEnabled = $derived(canEdit && !!onQuickAdd);

	function dateKeyAt(day: number) {
		return fromDayNumber(visibleDays.start + day);
	}

	function pressDay(event: PointerEvent, person: Personnel, row: HTMLElement) {
		if (saving || !canEditAvailabilityFor(person)) return;
		const commit: GestureCommit = (effect) => {
			if (effect.type !== 'quick-add') return;
			const anchor = row.querySelector<HTMLElement>(`[data-day="${effect.end}"]`) ?? row;
			onQuickAdd?.(person, dateKeyAt(effect.start), dateKeyAt(effect.end), anchor);
		};
		gesture.pressDay(event, person.id, row, days.length, commit);
	}

	function pressEdge(event: PointerEvent, person: Personnel, bar: Bar, edge: 'start' | 'end', row: HTMLElement) {
		if (!canEditAvailabilityFor(person)) return;
		const target = {
			personId: person.id,
			entryId: bar.entry.id,
			edge,
			start: toDayNumber(bar.entry.startDate) - visibleDays.start,
			end: toDayNumber(bar.entry.endDate) - visibleDays.start
		};
		gesture.pressEdge(event, target, row, days.length, (effect) => {
			if (effect.type === 'resize') onResize?.(person, bar.entry, dateKeyAt(effect.start), dateKeyAt(effect.end));
		});
	}

	function clickCell(person: Personnel, date: Date) {
		if (!gesture.consumeDragEndClick()) onCellClick?.(person, date);
	}

	function rowLayout(personId: string) {
		const state = gesture.state;
		if (state.kind !== 'resizing' || state.personId !== personId) {
			return tracks.layout(personId, visibleDays, policy);
		}
		const range = gestureRange(state)!;
		const spans = tracks
			.spans(personId)
			.map((span) =>
				span.entry.id === state.entryId
					? {
							...span,
							start: (visibleDays.start + range.start) as DayNumber,
							end: (visibleDays.start + range.end) as DayNumber
						}
					: span
			)
			.sort((a, b) => a.start - b.start || (a.entry.id < b.entry.id ? -1 : 1));
		return layoutBars(spans, visibleDays, policy);
	}

	function rowSelection(personId: string) {
		const state = gesture.state;
		if (state.kind === 'selecting') return state.personId === personId ? gestureRange(state) : null;
		if (quickAddSelection?.personId !== personId) return null;
		return {
			start: toDayNumber(quickAddSelection.startDate) - visibleDays.start,
			end: toDayNumber(quickAddSelection.endDate) - visibleDays.start
		};
	}

	function groupOutCounts(group: string) {
		const personnel = personnelByGroup.find((grp) => grp.group === group)?.personnel ?? [];
		return tracks.outCounts(
			personnel.map((person) => person.id),
			visibleDays
		);
	}
</script>

<div
	class="calendar flex flex-1 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground [--calendar-cell-width:36px] [--calendar-personnel-column-width:200px] max-[641px]:[--calendar-cell-width:32px] max-[641px]:[--calendar-personnel-column-width:120px] min-[641px]:max-[1025px]:[--calendar-personnel-column-width:160px]"
	style:--dates-count={dates.length}
>
	<CalendarHeader
		{year}
		{month}
		{monthName}
		headerCells={days}
		{lanes}
		{onPrevMonth}
		{onNextMonth}
		{onGoToToday}
		{onNavigateToMonth}
		onDateClick={canEditAssignments ? onDateClick : undefined}
		{scrollLeft}
		{scrollbarWidth}
	/>

	<div
		class="calendar-body flex-1 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
		bind:this={calendarBodyEl}
		onscroll={handleScroll}
	>
		<div class="calendar-grid flex min-h-full min-w-full flex-col">
			{#if totalPersonnel === 0}
				<Empty.Root class="min-h-52 border-0">
					<Empty.Header>
						<Empty.Title level={3}>No personnel added yet</Empty.Title>
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
					class="calendar-rows relative min-w-[calc(var(--calendar-personnel-column-width)+(var(--calendar-cell-width)*var(--dates-count)))]"
					style:height={`${rosterLayout.totalHeight}px`}
				>
					{#each visibleRosterRows as row (row.key)}
						<div
							class={[
								'virtual-row absolute top-0 left-0 w-full overflow-clip',
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
									outCounts={collapsedGroups.has(row.group) ? groupOutCounts(row.group) : undefined}
									{days}
									onToggle={() => toggleGroup(row.group)}
									onPinToggle={() => onPinToggle?.(row.group)}
								/>
							{:else}
								<CalendarRow
									person={row.person}
									{days}
									layout={rowLayout(row.person.id)}
									selectedEntryId={popoverEntry?.personId === row.person.id ? popoverEntry.entryId : null}
									selection={rowSelection(row.person.id)}
									markers={markersByPerson.get(row.person.id)}
									onboarding={onboardingIds.has(row.person.id)}
									{highlightOnboarding}
									loss={upcomingLossMap?.get(row.person.id)}
									{showPersonnelRoles}
									onCellClick={canEdit ? clickCell : undefined}
									onMarkerClick={canEditAssignments ? onMarkerClick : undefined}
									{onPersonClick}
									{onOpenEntry}
									{onOpenOverflow}
									onPressDay={dragEnabled ? pressDay : undefined}
									onPressEdge={dragEnabled && onResize && !saving && canEditAvailabilityFor(row.person)
										? pressEdge
										: undefined}
								/>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
