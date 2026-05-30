<script lang="ts">
	import type {
		CalendarPersonDateCellState,
		CalendarPersonHeaderState
	} from '$features/calendar/utils/calendarRenderState';
	import * as DateCell from '$lib/components/ui/date-cell/index.js';
	import type { Personnel } from '$lib/types';

	interface Props {
		person: Personnel;
		personHeader?: CalendarPersonHeaderState;
		cells: CalendarPersonDateCellState[];
		showStatusText?: boolean;
		showPersonnelRoles?: boolean;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
	}

	let {
		person,
		personHeader,
		cells,
		showStatusText = false,
		showPersonnelRoles = false,
		onCellClick,
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
	class="personnel-row grid h-full w-full min-w-[calc(var(--calendar-personnel-column-width)+(var(--calendar-cell-width)*var(--dates-count)))] items-stretch [grid-template-columns:var(--calendar-personnel-column-width)_repeat(var(--dates-count),minmax(var(--calendar-cell-width),1fr))]"
>
	<button
		class={[
			'personnel-info sticky left-0 z-[3] flex h-full cursor-pointer items-center gap-2 border-r border-b bg-card px-2 py-1 text-left hover:bg-muted sm:px-3',
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
	</button>
	{#each cells as cell (cell.dateKey)}
		<DateCell.Root
			weekend={cell.weekend}
			today={cell.today}
			holiday={cell.holiday}
			holidayName={cell.holidayName}
			statuses={cell.statuses}
			markers={cell.markers}
			{showStatusText}
			onboarding={cell.onboarding}
			onclick={() => handleCellClick(cell.date)}
		/>
	{/each}
</div>
