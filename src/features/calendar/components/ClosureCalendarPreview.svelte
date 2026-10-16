<script lang="ts">
	import type { SpecialDay } from '$features/calendar/contracts';
	import { buildCalendarLanes } from '$features/calendar/utils/calendarLanes';
	import { buildCalendarDays } from '$features/calendar/utils/calendarRenderState';
	import { parseDate } from '$lib/utils/dates';
	import CalendarLanes from './calendar-lanes/CalendarLanes.svelte';

	interface Props {
		/** First and last day of the draft; the preview shows the weeks around them. */
		startDate: string;
		endDate: string;
		/** Saved days plus the draft's new closure days. */
		specialDays: readonly SpecialDay[];
	}

	let { startDate, endDate, specialDays }: Props = $props();

	const MAX_WEEKS = 2;

	const weeks = $derived.by(() => {
		const first = parseDate(startDate);
		first.setDate(first.getDate() - first.getDay());
		const last = parseDate(endDate < startDate ? startDate : endDate);
		const result: Date[][] = [];
		for (let day = first; day <= last && result.length < MAX_WEEKS; ) {
			const week: Date[] = [];
			for (let index = 0; index < 7; index++) {
				week.push(day);
				day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
			}
			result.push(week);
		}
		return result;
	});
	const hiddenAfter = $derived.by(() => {
		const lastShown = weeks.at(-1)?.at(-1);
		return lastShown && parseDate(endDate) > lastShown ? lastShown : null;
	});
</script>

<div
	class="flex flex-col gap-2 [--calendar-cell-width:1.75rem] [--calendar-personnel-column-width:3.75rem] [--dates-count:7]"
>
	{#each weeks as dates (dates[0].getTime())}
		{@const headerCells = buildCalendarDays(dates, specialDays)}
		<div class="overflow-hidden rounded-md border">
			<div
				class="grid w-full grid-cols-[var(--calendar-personnel-column-width)_repeat(var(--dates-count),minmax(var(--calendar-cell-width),1fr))]"
				aria-hidden="true"
			>
				<div class="border-r border-b bg-muted"></div>
				{#each headerCells as header (header.dateKey)}
					<div
						class={[
							'flex min-w-0 flex-col items-center gap-px border-r border-b bg-card py-1 last:border-r-0',
							header.weekend && 'bg-muted/55',
							header.holiday && 'bg-warning-muted/60',
							header.today && 'bg-primary/10'
						]}
					>
						<span class="font-mono text-[9px] font-semibold tracking-widest text-muted-foreground uppercase">
							{header.dayName.slice(0, 1)}
						</span>
						<span class="font-display text-sm leading-none font-bold">{header.dayOfMonth}</span>
					</div>
				{/each}
			</div>
			<CalendarLanes
				lanes={buildCalendarLanes({
					dates,
					assignmentTypes: [],
					assignments: [],
					specialDays,
					personnel: [],
					groups: []
				})}
				{headerCells}
			/>
		</div>
	{/each}
	{#if hiddenAfter}
		<p class="text-xs text-muted-foreground">Showing the first two weeks.</p>
	{/if}
</div>
