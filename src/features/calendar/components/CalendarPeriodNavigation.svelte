<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { calendarPeriod, shiftCalendarPeriod, type CalendarViewMode } from '$features/calendar/utils/calendarRange';
	import MonthYearPicker from './MonthYearPicker.svelte';

	interface Props {
		view: CalendarViewMode;
		anchor: Date;
		onAnchorChange: (anchor: Date) => void;
		disabled?: boolean;
	}

	let { view, anchor, onAnchorChange, disabled = false }: Props = $props();

	const period = $derived(calendarPeriod(anchor, view));

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
</script>

<div class="relative flex items-center gap-1.5">
	<Button variant="outline" size="sm" {disabled} onclick={goToToday}>Today</Button>
	<ButtonGroup.Root aria-label="Calendar period">
		<Button
			variant="outline"
			size="icon-sm"
			{disabled}
			aria-label={period.previousLabel}
			onclick={() => onAnchorChange(shiftCalendarPeriod(anchor, view, -1))}
		>
			<ChevronLeftIcon aria-hidden="true" />
		</Button>
		<Button
			bind:ref={pickerTrigger}
			variant="outline"
			size="sm"
			class="font-display tracking-wide uppercase"
			data-testid={view === 'month' ? 'calendar-month-label' : 'long-range-date-label'}
			{disabled}
			aria-expanded={pickerOpen}
			aria-haspopup="dialog"
			onmousedown={(event: MouseEvent) => event.stopPropagation()}
			onclick={() => (pickerOpen = !pickerOpen)}
		>
			{period.title}
		</Button>
		<Button
			variant="outline"
			size="icon-sm"
			{disabled}
			aria-label={period.nextLabel}
			onclick={() => onAnchorChange(shiftCalendarPeriod(anchor, view, 1))}
		>
			<ChevronRightIcon aria-hidden="true" />
		</Button>
	</ButtonGroup.Root>
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
