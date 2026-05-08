<script lang="ts">
	import type {
		Personnel,
		AvailabilityEntry,
		StatusType,
		SpecialDay,
		AssignmentType,
		DailyAssignment
	} from '$lib/types';
	import type { DutyEventBadge } from '$features/calendar/utils/dutyEventBadges';
	import type { UpcomingLossRecord } from '$features/dashboard/utils/evaluateUpcomingLosses';
	import { isWeekend, isToday, formatDate } from '$lib/utils/dates';
	import DateCell from '$lib/components/ui/DateCell.svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		person: Personnel;
		dates: Date[];
		personAvailability: AvailabilityEntry[];
		statusTypeMap: Map<string, StatusType>;
		specialDays: SpecialDay[];
		assignmentTypes: AssignmentType[];
		personAssignments: DailyAssignment[];
		personDutyBadges?: Map<string, DutyEventBadge[]>;
		showStatusText?: boolean;
		showPersonnelRoles?: boolean;
		isOnboarding?: boolean;
		highlightOnboarding?: boolean;
		/** Upcoming-loss record for this person, if they are approaching ETS or PCS/DEROS. */
		upcomingLossRecord?: UpcomingLossRecord;
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
		personDutyBadges,
		showStatusText = false,
		showPersonnelRoles = false,
		isOnboarding = false,
		highlightOnboarding = true,
		upcomingLossRecord,
		onCellClick,
		onPersonClick
	}: Props = $props();

	// Build date-keyed index of availability entries for this person (once per render)
	const availabilityByDate = $derived.by(() => {
		const map = new SvelteMap<string, AvailabilityEntry[]>();
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
		const map = new SvelteMap<string, { type: AssignmentType; assignment: DailyAssignment }[]>();
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
		const map = new SvelteMap<string, SpecialDay>();
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

<div
	class="personnel-row grid w-full min-w-[calc(var(--personnel-column-width)+(var(--cell-width)*var(--dates-count)))] items-stretch [grid-template-columns:var(--personnel-column-width)_repeat(var(--dates-count),minmax(var(--cell-width),1fr))]"
>
	<button
		class={[
			'personnel-info sticky left-0 z-[3] flex min-h-[var(--cell-height)] cursor-pointer items-center gap-2 border-r border-b bg-card px-2 py-1 text-left hover:bg-muted sm:px-3',
			!showPersonnelRoles && 'py-1'
		]}
		onclick={handlePersonClick}
	>
		<span class="min-w-8 shrink-0 font-mono text-xs font-semibold tracking-wider text-primary uppercase sm:min-w-10">
			{person.rank}
		</span>
		<div class="flex min-w-0 flex-col overflow-hidden">
			<span class="flex min-w-0 items-center gap-1.5">
				<span class="overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-foreground"
					>{person.lastName}, {person.firstName}</span
				>
				{#if isOnboarding}
					<span class="size-2 shrink-0 rounded-[2px] bg-primary" title="Active onboarding"></span>
				{/if}
				{#if upcomingLossRecord}
					<span
						class={[
							'shrink-0 rounded-md px-1 py-px font-mono text-[10px] leading-tight font-semibold tracking-widest uppercase',
							upcomingLossRecord.triggerType === 'ETS'
								? 'bg-warning-muted text-warning-foreground'
								: 'bg-muted text-muted-foreground'
						]}
						data-testid="loss-indicator-{person.id}"
						title="{upcomingLossRecord.triggerType} in {upcomingLossRecord.daysRemaining} day{upcomingLossRecord.daysRemaining ===
						1
							? ''
							: 's'}">{upcomingLossRecord.triggerType === 'ETS' ? 'ETS' : 'PCS'}</span
					>
				{/if}
			</span>
			{#if showPersonnelRoles && person.clinicRole}
				<span
					class="overflow-hidden font-mono text-[10px] tracking-wider text-ellipsis whitespace-nowrap text-muted-foreground uppercase max-sm:hidden"
				>
					{person.clinicRole}
				</span>
			{/if}
		</div>
	</button>
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
			dutyBadges={personDutyBadges?.get(dateStr) ?? []}
			{showStatusText}
			isOnboarding={isOnboarding && highlightOnboarding}
			onclick={() => handleCellClick(date)}
		/>
	{/each}
</div>
