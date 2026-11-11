<script lang="ts" module>
	import type { CalendarViewMode } from '$features/calendar/utils/calendarRange';

	const VIEWS: readonly { value: CalendarViewMode; label: string }[] = [
		{ value: 'agenda', label: 'Agenda' },
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' },
		{ value: '3-month', label: '3-Month' }
	];
</script>

<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import type { TodayAvailability } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import CalendarPeriodNavigation from './CalendarPeriodNavigation.svelte';

	interface Props {
		view: CalendarViewMode;
		anchor: Date;
		today: TodayAvailability | null;
		orgName: string;
		personnelCount: number;
		onAnchorChange: (anchor: Date) => void;
		onToday: () => void;
		onViewChange: (view: CalendarViewMode) => void;
	}

	let { view, anchor, today, orgName, personnelCount, onAnchorChange, onToday, onViewChange }: Props = $props();

	const eyebrow = $derived(`Calendar · ${orgName} · ${personnelCount} personnel`);
	const todayLabel = $derived(
		today?.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
	);

	function chooseView(value: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		const chosen = VIEWS.find((view) => view.value === value);
		if (chosen) onViewChange(chosen.value);
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
		{#each VIEWS as item (item.value)}
			<ToggleGroup.Item value={item.value}>{item.label}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
{/snippet}

<CalendarPeriodNavigation {view} {anchor} {onAnchorChange} {onToday}>
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
