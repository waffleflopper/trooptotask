<script lang="ts">
	import type { AvailabilityEntry } from '$features/calendar/contracts';
	import { fitMarkers, type Bar, type BarLayout } from '$features/calendar/utils/barLayout';
	import type { CalendarCellMarkerState, CalendarDateHeaderState } from '$features/calendar/utils/calendarRenderState';
	import type { Personnel, UpcomingLossRecord } from '$features/personnel/contracts';
	import { Button } from '$lib/components/ui/button';
	import * as DateCell from './date-cell/index.js';
	import AssignmentCodeChip from './AssignmentCodeChip.svelte';
	import BarTrack from './calendar-bars/BarTrack.svelte';

	const NO_MARKERS: ReadonlyMap<number, readonly CalendarCellMarkerState[]> = new Map();

	interface Props {
		person: Personnel;
		days: readonly CalendarDateHeaderState[];
		layout: BarLayout;
		selectedEntryId?: string | null;
		selection?: { start: number; end: number } | null;
		markers?: ReadonlyMap<number, readonly CalendarCellMarkerState[]>;
		onboarding?: boolean;
		highlightOnboarding?: boolean;
		loss?: UpcomingLossRecord;
		showPersonnelRoles?: boolean;
		onCellClick?: (person: Personnel, date: Date) => void;
		onMarkerClick?: (date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
		onOpenEntry?: (person: Personnel, entry: AvailabilityEntry, anchor: HTMLElement) => void;
		onOpenOverflow?: (person: Personnel, entryIds: readonly string[], anchor: HTMLElement) => void;
		onPressDay?: (event: PointerEvent, person: Personnel, row: HTMLElement) => void;
		onPressEdge?: (event: PointerEvent, person: Personnel, bar: Bar, edge: 'start' | 'end', row: HTMLElement) => void;
	}

	let {
		person,
		days,
		layout,
		selectedEntryId = null,
		selection = null,
		markers = NO_MARKERS,
		onboarding = false,
		highlightOnboarding = true,
		loss,
		showPersonnelRoles = false,
		onCellClick,
		onMarkerClick,
		onPersonClick,
		onOpenEntry,
		onOpenOverflow,
		onPressDay,
		onPressEdge
	}: Props = $props();

	let rowEl: HTMLDivElement;

	function pressDay(event: PointerEvent) {
		if ((event.target as Element).closest('[data-slot="date-cell"]')) onPressDay?.(event, person, rowEl);
	}

	const personLabel = $derived(`${person.rank} ${person.lastName}, ${person.firstName}`);
	const fitted = $derived(fitMarkers(layout, [...markers.keys()]));
	const tintCells = $derived(onboarding && highlightOnboarding);

	function cellTitle(index: number, holidayName: string | undefined) {
		const names = markers.get(index)?.map((marker) => marker.name) ?? [];
		return [holidayName, ...names].filter(Boolean).join('\n') || undefined;
	}
</script>

<div
	bind:this={rowEl}
	role="presentation"
	data-person-id={person.id}
	onpointerdown={onPressDay && pressDay}
	class="personnel-row relative grid h-full w-full min-w-[calc(var(--calendar-personnel-column-width)+(var(--calendar-cell-width)*var(--dates-count)))] items-stretch [grid-template-columns:var(--calendar-personnel-column-width)_repeat(var(--dates-count),minmax(var(--calendar-cell-width),1fr))]"
>
	<Button
		variant="cell"
		size="none"
		class="sticky left-0 z-[3] h-full justify-start gap-2 border-r border-b border-border bg-card px-2 py-1 text-left sm:px-3"
		onclick={() => onPersonClick?.(person)}
	>
		<span class="min-w-8 shrink-0 font-mono text-xs font-semibold tracking-wider text-primary uppercase sm:min-w-10">
			{person.rank}
		</span>
		<div class="flex min-w-0 flex-col overflow-hidden">
			<span class="flex min-w-0 items-center gap-1.5">
				<span class="overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-foreground"
					>{person.lastName}, {person.firstName}</span
				>
				{#if onboarding}
					<span class="size-2 shrink-0 rounded-[2px] bg-primary" title="Active onboarding"></span>
				{/if}
				{#if loss}
					<span
						class={[
							'shrink-0 rounded-md px-1 py-px font-mono text-[10px] leading-tight font-semibold tracking-widest uppercase',
							loss.triggerType === 'ETS' ? 'bg-warning-muted text-warning-foreground' : 'bg-muted text-muted-foreground'
						]}
						data-testid="loss-indicator-{person.id}"
						title="{loss.triggerType} in {loss.daysRemaining} day{loss.daysRemaining === 1 ? '' : 's'}"
						>{loss.triggerType === 'ETS' ? 'ETS' : 'PCS'}</span
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
	</Button>
	{#each days as day, index (day.dateKey)}
		<DateCell.Root
			weekend={day.weekend}
			today={day.today}
			holiday={day.holiday}
			title={cellTitle(index, day.holidayName)}
			onboarding={tintCells}
			data-day={index}
			aria-label="{personLabel}, {day.dateLabel}"
			onclick={() => onCellClick?.(person, day.date)}
		/>
	{/each}
	<BarTrack
		layout={fitted.layout}
		{personLabel}
		size="month"
		{selectedEntryId}
		{selection}
		markers={fitted.markers}
		onPressEdge={onPressEdge && ((event, bar, edge) => onPressEdge(event, person, bar, edge, rowEl))}
		onOpenEntry={onOpenEntry && ((entry, anchor) => onOpenEntry(person, entry, anchor))}
		onOpenOverflow={onOpenOverflow && ((entryIds, anchor) => onOpenOverflow(person, entryIds, anchor))}
	>
		{#snippet marker(index)}
			{@const [first, ...more] = markers.get(index)!}
			{@const day = days[index]}
			{@const label = `${personLabel}, ${day.dateLabel}`}
			{@const open = onMarkerClick && (() => onMarkerClick(day.date))}
			{@const action = open ? '. Edit assignments' : ''}
			<AssignmentCodeChip
				code={first.shortName}
				color={first.color}
				label={`${first.name}, ${label}${action}`}
				onclick={open}
			/>
			{#if more.length > 0}
				<AssignmentCodeChip
					code={`+${more.length}`}
					color="var(--muted-foreground)"
					label={`${more.length} more: ${more.map((item) => item.name).join(', ')}, ${label}${action}`}
					onclick={open}
				/>
			{/if}
		{/snippet}
	</BarTrack>
</div>
