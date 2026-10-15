<script lang="ts">
	import type {
		CalendarPersonDateCellState,
		CalendarPersonHeaderState
	} from '$features/calendar/utils/calendarRenderState';
	import { Button } from '$lib/components/ui/button';
	import * as DateCell from './date-cell/index.js';
	import DateCellMarker from './date-cell/date-cell-marker.svelte';
	import type { Personnel } from '$features/personnel/contracts';

	interface Props {
		person: Personnel;
		personHeader?: CalendarPersonHeaderState;
		cells: CalendarPersonDateCellState[];
		showStatusText?: boolean;
		showPersonnelRoles?: boolean;
		onCellClick?: (person: Personnel, date: Date) => void;
		onMarkerClick?: (date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
	}

	let {
		person,
		personHeader,
		cells,
		showStatusText = false,
		showPersonnelRoles = false,
		onCellClick,
		onMarkerClick,
		onPersonClick
	}: Props = $props();

	function handleCellClick(date: Date) {
		onCellClick?.(person, date);
	}

	function handlePersonClick() {
		onPersonClick?.(person);
	}
</script>

<div
	class="personnel-row relative grid h-full w-full min-w-[calc(var(--calendar-personnel-column-width)+(var(--calendar-cell-width)*var(--dates-count)))] items-stretch [grid-template-columns:var(--calendar-personnel-column-width)_repeat(var(--dates-count),minmax(var(--calendar-cell-width),1fr))]"
>
	<Button
		variant="cell"
		size="none"
		class="sticky left-0 z-[3] h-full justify-start gap-2 border-r border-b border-border bg-card px-2 py-1 text-left sm:px-3"
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
				{#if personHeader?.isOnboarding}
					<span class="size-2 shrink-0 rounded-[2px] bg-primary" title="Active onboarding"></span>
				{/if}
				{#if personHeader?.upcomingLossRecord}
					<span
						class={[
							'shrink-0 rounded-md px-1 py-px font-mono text-[10px] leading-tight font-semibold tracking-widest uppercase',
							personHeader.upcomingLossRecord.triggerType === 'ETS'
								? 'bg-warning-muted text-warning-foreground'
								: 'bg-muted text-muted-foreground'
						]}
						data-testid="loss-indicator-{person.id}"
						title="{personHeader.upcomingLossRecord.triggerType} in {personHeader.upcomingLossRecord
							.daysRemaining} day{personHeader.upcomingLossRecord.daysRemaining === 1 ? '' : 's'}"
						>{personHeader.upcomingLossRecord.triggerType === 'ETS' ? 'ETS' : 'PCS'}</span
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
	{#each cells as cell, index (cell.dateKey)}
		<DateCell.Root
			weekend={cell.weekend}
			today={cell.today}
			holiday={cell.holiday}
			holidayName={cell.holidayName}
			statuses={cell.statuses}
			markers={cell.markers}
			{showStatusText}
			onboarding={cell.onboarding}
			aria-label={cell.label}
			onclick={() => handleCellClick(cell.date)}
		/>
		{#if cell.markers.length > 0}
			{@const [first, ...more] = cell.markers}
			{@const open = onMarkerClick && (() => onMarkerClick(cell.date))}
			<!-- Positioned over the cell so markers are sibling targets of the cell button, never nested in it. -->
			<div
				class="pointer-events-none absolute inset-0 z-[2] flex min-w-0 items-end justify-end gap-px p-[3px]"
				style:grid-row="1"
				style:grid-column={index + 2}
			>
				<DateCellMarker marker={first} label={`${first.name}, ${cell.label}. Edit assignments`} onclick={open} />
				{#if more.length > 0}
					<DateCellMarker
						marker={{ shortName: `+${more.length}`, color: 'var(--muted-foreground)' }}
						label={`${more.length} more: ${more.map((marker) => marker.name).join(', ')}, ${cell.label}. Edit assignments`}
						onclick={open}
					/>
				{/if}
			</div>
		{/if}
	{/each}
</div>
