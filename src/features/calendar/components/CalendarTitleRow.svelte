<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import type { TodayAvailability } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { CalendarViewMode } from '$features/calendar/utils/calendarRange';
	import CalendarPeriodNavigation from './CalendarPeriodNavigation.svelte';

	interface Props {
		view: CalendarViewMode;
		anchor: Date;
		today: TodayAvailability | null;
		orgName: string;
		/** The focused Group, when the matrix shows less than the reader's whole view. */
		scopeLabel?: string | null;
		personnelCount: number;
		onAnchorChange: (anchor: Date) => void;
		onViewChange: (view: CalendarViewMode) => void;
	}

	let {
		view,
		anchor,
		today,
		orgName,
		scopeLabel = null,
		personnelCount,
		onAnchorChange,
		onViewChange
	}: Props = $props();

	const eyebrow = $derived(
		['Calendar', orgName, scopeLabel, `${personnelCount} personnel`].filter((part) => part !== null).join(' · ')
	);
	const todayLabel = $derived(
		today?.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
	);

	function chooseView(value: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		if (value === 'month' || value === '3-month') onViewChange(value);
	}
</script>

{#snippet summary()}
	{#if today}
		<div class="grid text-right">
			<p class="text-sm text-foreground">
				<span class="font-semibold">{today.available}</span> of {today.total} available
			</p>
			<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				Today · {todayLabel}
			</p>
		</div>
	{/if}
	<ToggleGroup.Root type="single" size="sm" bind:value={() => view, chooseView} aria-label="Calendar view">
		<ToggleGroup.Item value="month">Month</ToggleGroup.Item>
		<ToggleGroup.Item value="3-month">3-Month</ToggleGroup.Item>
	</ToggleGroup.Root>
{/snippet}

<CalendarPeriodNavigation {view} {anchor} {onAnchorChange}>
	{#snippet layout({ monthPicker, previous, next, today })}
		{#snippet title()}
			{@render monthPicker({ class: '-mx-2 h-auto px-2 py-0.5 [font:inherit]' })}
		{/snippet}
		{#snippet navigation()}
			<div class="flex items-center gap-1.5">
				{@render previous()}
				{@render next()}
				{@render today()}
			</div>
		{/snippet}
		<PageShell.Header {eyebrow} {title} meta={navigation} aside={summary} />
	{/snippet}
</CalendarPeriodNavigation>
