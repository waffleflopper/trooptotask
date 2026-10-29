<script lang="ts">
	import type { Personnel } from '$features/personnel/contracts';
	import type { AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from '$features/calendar/contracts';
	import type { UpcomingLossRecord } from '$features/personnel/contracts';
	import type { CalendarLane } from '$features/calendar/utils/calendarLanes';
	import { commitmentsOf, type CommitmentsByPerson } from '$features/calendar/projection/projectionCommitments';
	import CalendarHeader from './CalendarHeader.svelte';
	import type { SuspenseLaneDay } from './projection/SuspenseLaneCell.svelte';
	import CalendarRow from './CalendarRow.svelte';
	import GroupHeader from './GroupHeader.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';
	import type { AvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
	import { dayWindow, fromDayNumber, toDayNumber, type DayNumber } from '$lib/utils/dayNumber';
	import { layoutBars, type LabelPolicy } from '$lib/components/patterns/calendar-bars';
	import type { CalendarBar } from '$features/calendar/utils/calendarBars';
	import { gestureRange } from '$features/calendar/utils/calendarGesture';
	import { CalendarGesture, type GestureCommit } from './calendar-bars/gesture.svelte';
	import { buildCalendarDays, buildDutyMarkers } from '$features/calendar/utils/calendarRenderState';
	import { buildVirtualRowLayout, getVisibleVirtualRows } from '$features/calendar/utils/virtualRows';
	import { SvelteSet } from 'svelte/reactivity';

	// A top band, then the slimmer sub-group headers below it.
	const GROUP_ROW_HEIGHTS = [35, 28, 26];
	const PERSON_ROW_HEIGHT_WITH_ROLES = 46;
	const PERSON_ROW_HEIGHT_WITHOUT_ROLES = 36;
	const DEFAULT_VIEWPORT_HEIGHT = 720;
	const ROW_OVERSCAN_COUNT = 8;

	interface GroupData {
		groupId: string | null;
		group: string;
		personnel: Personnel[];
		/** 0 for a top band; sub-groups follow their parent at 1 and 2. */
		level?: number;
		name?: string;
		/** Everyone in the Group and its sub-groups; defaults to `personnel`. */
		people?: Personnel[];
		pinnable?: boolean;
	}

	interface Props {
		dates: Date[];
		personnelByGroup: GroupData[];
		tracks: AvailabilityTracks;
		specialDays: SpecialDay[];
		pinnedGroupIds: readonly string[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		lanes?: readonly CalendarLane[];
		/** Active suspenses by date, drawn in the date headers. */
		suspenses?: readonly SuspenseLaneDay[];
		/** Taskings each Person is picked for over these dates; awareness only, never availability. */
		commitments?: CommitmentsByPerson;
		activeOnboardingPersonnelIds?: string[];
		highlightOnboarding?: boolean;
		canEdit?: boolean;
		canEditAssignments?: boolean;
		showStatusText?: boolean;
		showPersonnelRoles?: boolean;
		/** Map of personId → UpcomingLossRecord for per-row loss indicators. */
		upcomingLossMap?: ReadonlyMap<string, UpcomingLossRecord>;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
		/** Omitted for a Group-scoped reader, who has no pins. */
		onPinToggle?: (groupId: string) => void;
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
		/** Off for a reader whose whole view is one Group with no sub-groups; the title row names it instead. */
		showGroupHeaders?: boolean;
	}

	let {
		dates,
		personnelByGroup,
		tracks,
		specialDays,
		pinnedGroupIds,
		assignmentTypes,
		assignments,
		lanes = [],
		suspenses,
		commitments,
		activeOnboardingPersonnelIds = [],
		highlightOnboarding = true,
		canEdit = true,
		canEditAssignments = canEdit,
		showStatusText = false,
		showPersonnelRoles = false,
		upcomingLossMap,
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
		personnelHref,
		showGroupHeaders = true
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
	const nested = $derived(personnelByGroup.some((grp) => (grp.level ?? 0) > 0));
	const personRowHeight = $derived(showPersonnelRoles ? PERSON_ROW_HEIGHT_WITH_ROLES : PERSON_ROW_HEIGHT_WITHOUT_ROLES);
	const rowOverscanPx = $derived(personRowHeight * ROW_OVERSCAN_COUNT);

	const rosterRows = $derived.by(() => {
		const rows: (
			| { type: 'group'; key: string; band: string; data: GroupData; level: number; height: number }
			| { type: 'person'; key: string; person: Personnel; height: number }
		)[] = [];

		// A collapsed band hides its own people and every sub-group band after it.
		let collapsedLevel = Infinity;
		for (const grp of personnelByGroup) {
			const band = grp.groupId ?? '';
			const level = grp.level ?? 0;
			if (level > collapsedLevel) continue;
			collapsedLevel = Infinity;
			if (showGroupHeaders) {
				rows.push({
					type: 'group',
					key: `group:${band}`,
					band,
					data: grp,
					level,
					height: GROUP_ROW_HEIGHTS[level] ?? GROUP_ROW_HEIGHTS.at(-1)!
				});
			}

			if (showGroupHeaders && collapsedGroups.has(band)) {
				collapsedLevel = level;
				continue;
			}

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

	// In a nested tree the top band whose people fill the top of the viewport stays in view above them, pushed up by
	// the next top band as it arrives. It takes the place of its own row, so the header is never rendered twice.
	const stuckBand = $derived.by(() => {
		if (!nested) return null;
		let current: (typeof rosterLayout.rows)[number] | null = null;
		for (const row of rosterLayout.rows) {
			if (row.type !== 'group' || row.level !== 0) continue;
			if (row.top >= scrollTop) {
				return current && { row: current, offset: Math.min(0, row.top - scrollTop - current.height) };
			}
			current = row;
		}
		return current && { row: current, offset: 0 };
	});

	const visibleRosterRows = $derived.by(() =>
		getVisibleVirtualRows(rosterLayout.rows, scrollTop, viewportHeight, rowOverscanPx).filter(
			(row) => row.key !== stuckBand?.row.key
		)
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

	function pressEdge(
		event: PointerEvent,
		person: Personnel,
		bar: CalendarBar,
		edge: 'start' | 'end',
		row: HTMLElement
	) {
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

	function groupOutCounts(grp: GroupData) {
		return tracks.outCounts(
			(grp.people ?? grp.personnel).map((person) => person.id),
			visibleDays
		);
	}
</script>

{#snippet groupHeader(row: { band: string; data: GroupData; level: number })}
	{@const grp = row.data}
	{@const groupId = grp.groupId}
	{@const collapsed = collapsedGroups.has(row.band)}
	<GroupHeader
		groupName={grp.name ?? grp.group}
		level={row.level}
		count={nested ? (grp.people ?? grp.personnel).length : undefined}
		isCollapsed={collapsed}
		isPinned={groupId !== null && pinnedGroupIds.includes(groupId)}
		outCounts={collapsed ? groupOutCounts(grp) : undefined}
		{days}
		onToggle={() => toggleGroup(row.band)}
		onPinToggle={groupId !== null && grp.pinnable !== false && onPinToggle ? () => onPinToggle(groupId) : undefined}
	/>
{/snippet}

<div
	class="calendar flex flex-1 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground [--calendar-cell-width:30px] [--calendar-personnel-column-width:160px] max-[641px]:[--calendar-cell-width:32px] max-[641px]:[--calendar-personnel-column-width:120px]"
	style:--dates-count={dates.length}
>
	<CalendarHeader
		headerCells={days}
		{lanes}
		{suspenses}
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
					{#if stuckBand}
						<div
							class="sticky top-0 z-[6] h-0"
							style:transform={`translateY(${stuckBand.offset}px)`}
							data-testid="calendar-stuck-band"
						>
							<div class="virtual-row virtual-row--group w-full" style:height={`${stuckBand.row.height}px`}>
								{@render groupHeader(stuckBand.row)}
							</div>
						</div>
					{/if}
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
								{@render groupHeader(row)}
							{:else}
								<CalendarRow
									person={row.person}
									{days}
									layout={rowLayout(row.person.id)}
									selectedEntryId={popoverEntry?.personId === row.person.id ? popoverEntry.entryId : null}
									selection={rowSelection(row.person.id)}
									markers={markersByPerson.get(row.person.id)}
									commitments={commitmentsOf(commitments, row.person.id)}
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
