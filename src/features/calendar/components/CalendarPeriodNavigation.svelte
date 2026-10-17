<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface MonthPickerStyle {
		variant?: 'ghost' | 'outline';
		size?: 'default' | 'sm';
		class?: string;
	}

	/** The controls a page arranges itself, all sharing one anchor and one picker. */
	export interface PeriodControls {
		monthPicker: Snippet<[MonthPickerStyle?]>;
		previous: Snippet;
		next: Snippet;
		today: Snippet;
	}
</script>

<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button';
	import { calendarPeriod, shiftCalendarPeriod, type CalendarViewMode } from '$features/calendar/utils/calendarRange';
	import MonthYearPicker from './MonthYearPicker.svelte';

	interface Props {
		view: CalendarViewMode;
		anchor: Date;
		onAnchorChange: (anchor: Date) => void;
		disabled?: boolean;
		layout: Snippet<[PeriodControls]>;
	}

	let { view, anchor, onAnchorChange, disabled = false, layout }: Props = $props();

	const period = $derived(calendarPeriod(anchor, view));

	let container = $state<HTMLElement | null>(null);
	let pickerOpen = $state(false);
	let pickerTrigger = $state<HTMLElement | null>(null);
	let pickerPosition = $state({ left: 0, top: 0 });

	function togglePicker() {
		if (!pickerOpen && container && pickerTrigger) {
			const box = container.getBoundingClientRect();
			const trigger = pickerTrigger.getBoundingClientRect();
			pickerPosition = { left: trigger.left - box.left, top: trigger.bottom - box.top + 8 };
		}
		pickerOpen = !pickerOpen;
	}

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

{#snippet monthPicker(style: MonthPickerStyle = {})}
	<Button
		bind:ref={pickerTrigger}
		variant={style.variant ?? 'ghost'}
		size={style.size}
		class={style.class}
		data-testid={view === 'month' ? 'calendar-month-label' : 'long-range-date-label'}
		{disabled}
		aria-expanded={pickerOpen}
		aria-haspopup="dialog"
		onmousedown={(event: MouseEvent) => event.stopPropagation()}
		onclick={togglePicker}
	>
		{period.title}
	</Button>
{/snippet}

{#snippet previous()}
	<Button
		variant="outline"
		size="icon-sm"
		{disabled}
		aria-label={period.previousLabel}
		onclick={() => onAnchorChange(shiftCalendarPeriod(anchor, view, -1))}
	>
		<ChevronLeftIcon aria-hidden="true" />
	</Button>
{/snippet}

{#snippet next()}
	<Button
		variant="outline"
		size="icon-sm"
		{disabled}
		aria-label={period.nextLabel}
		onclick={() => onAnchorChange(shiftCalendarPeriod(anchor, view, 1))}
	>
		<ChevronRightIcon aria-hidden="true" />
	</Button>
{/snippet}

{#snippet today()}
	<Button variant="outline" size="sm" {disabled} onclick={goToToday}>Today</Button>
{/snippet}

<div bind:this={container} class="relative shrink-0">
	{@render layout({ monthPicker, previous, next, today })}
	{#if pickerOpen}
		<div class="absolute z-50" style:left="{pickerPosition.left}px" style:top="{pickerPosition.top}px">
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
