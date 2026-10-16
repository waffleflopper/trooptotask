<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import type { TodayAvailability } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import { calendarPeriod, shiftCalendarPeriod, type CalendarViewMode } from '$features/calendar/utils/calendarRange';
	import MonthYearPicker from './MonthYearPicker.svelte';

	interface Props {
		view: CalendarViewMode;
		anchor: Date;
		today: TodayAvailability | null;
		orgName: string;
		personnelCount: number;
		onAnchorChange: (anchor: Date) => void;
		onViewChange: (view: CalendarViewMode) => void;
	}

	let { view, anchor, today, orgName, personnelCount, onAnchorChange, onViewChange }: Props = $props();

	const period = $derived(calendarPeriod(anchor, view));
	const eyebrow = $derived(`Calendar · ${orgName} · ${personnelCount} personnel`);
	const todayLabel = $derived(
		today?.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
	);

	let pickerOpen = $state(false);
	let pickerTrigger = $state<HTMLElement | null>(null);

	function closePickerToTrigger() {
		pickerOpen = false;
		pickerTrigger?.focus();
	}

	function selectMonth(year: number, month: number) {
		onAnchorChange(new Date(year, month, 1));
		closePickerToTrigger();
	}

	function goToToday() {
		const now = new Date();
		onAnchorChange(new Date(now.getFullYear(), now.getMonth(), 1));
	}

	function chooseView(value: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		if (value === 'month' || value === '3-month') onViewChange(value);
	}
</script>

{#snippet title()}
	<Button
		bind:ref={pickerTrigger}
		variant="ghost"
		class="-mx-2 h-auto px-2 py-0.5 [font:inherit]"
		data-testid={view === 'month' ? 'calendar-month-label' : 'long-range-date-label'}
		aria-expanded={pickerOpen}
		aria-haspopup="dialog"
		onmousedown={(event: MouseEvent) => event.stopPropagation()}
		onclick={() => (pickerOpen = !pickerOpen)}
	>
		{period.title}
	</Button>
{/snippet}

{#snippet navigation()}
	<div class="flex items-center gap-1.5">
		<Button
			variant="outline"
			size="icon-sm"
			aria-label={period.previousLabel}
			onclick={() => onAnchorChange(shiftCalendarPeriod(anchor, view, -1))}
		>
			<ChevronLeftIcon aria-hidden="true" />
		</Button>
		<Button
			variant="outline"
			size="icon-sm"
			aria-label={period.nextLabel}
			onclick={() => onAnchorChange(shiftCalendarPeriod(anchor, view, 1))}
		>
			<ChevronRightIcon aria-hidden="true" />
		</Button>
		<Button variant="outline" size="sm" onclick={goToToday}>Today</Button>
	</div>
{/snippet}

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

<div class="relative shrink-0">
	<PageShell.Header {eyebrow} {title} meta={navigation} aside={summary} />
	{#if pickerOpen}
		<div class="absolute top-full left-0 z-50 mt-2">
			<MonthYearPicker
				year={period.start.getFullYear()}
				month={period.start.getMonth()}
				onSelect={selectMonth}
				onEscape={closePickerToTrigger}
				onOutsideClick={() => (pickerOpen = false)}
			/>
		</div>
	{/if}
</div>
