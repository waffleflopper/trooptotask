<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import MonthYearPicker from './MonthYearPicker.svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		title: string;
		onPrev: () => void;
		onNext: () => void;
		onGoToToday: () => void;
		prevLabel?: string;
		nextLabel?: string;
		titleTestId?: string;
		pickerYear?: number;
		pickerMonth?: number;
		onSelectMonthYear?: (year: number, month: number) => void;
	}

	let {
		title,
		onPrev,
		onNext,
		onGoToToday,
		prevLabel = 'Prev',
		nextLabel = 'Next',
		titleTestId,
		pickerYear,
		pickerMonth,
		onSelectMonthYear
	}: Props = $props();

	let pickerOpen = $state(false);
	let pickerTrigger = $state<HTMLElement | null>(null);

	function togglePicker() {
		if (!onSelectMonthYear) return;
		pickerOpen = !pickerOpen;
	}

	function closePicker() {
		pickerOpen = false;
	}

	function closePickerToTrigger() {
		closePicker();
		pickerTrigger?.focus();
	}

	function handleSelectMonthYear(year: number, month: number) {
		onSelectMonthYear?.(year, month);
		closePickerToTrigger();
	}

	function stopMouseDownPropagation(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<div class="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3 sm:px-5">
	<div class="flex min-w-0 flex-auto flex-wrap items-center justify-between gap-2 sm:gap-3">
		<Button variant="outline" size="sm" onclick={onPrev} aria-label={prevLabel}>
			<ChevronLeftIcon aria-hidden="true" />
			{prevLabel}
		</Button>
		<div class="relative order-first flex min-w-0 flex-1 basis-full justify-center sm:order-none sm:basis-56">
			<h2
				class="m-0 min-w-0 text-center font-display text-2xl leading-tight font-bold tracking-wider text-foreground uppercase"
			>
				{#if onSelectMonthYear && pickerYear !== undefined && pickerMonth !== undefined}
					<Button
						bind:ref={pickerTrigger}
						variant="ghost"
						class="h-auto w-full px-2 py-0.5 whitespace-normal [font:inherit]"
						data-testid={titleTestId}
						aria-expanded={pickerOpen}
						aria-haspopup="dialog"
						onmousedown={stopMouseDownPropagation}
						onclick={togglePicker}
					>
						{title}
					</Button>
				{:else}
					<span data-testid={titleTestId}>{title}</span>
				{/if}
			</h2>
			{#if pickerOpen && pickerYear !== undefined && pickerMonth !== undefined}
				<div
					class="absolute top-[calc(100%+0.5rem)] left-1/2 z-50 -translate-x-1/2 max-sm:left-0 max-sm:right-0 max-sm:flex max-sm:translate-x-0 max-sm:justify-center"
				>
					<MonthYearPicker
						year={pickerYear}
						month={pickerMonth}
						onSelect={handleSelectMonthYear}
						onEscape={closePickerToTrigger}
						onOutsideClick={closePicker}
					/>
				</div>
			{/if}
		</div>
		<Button variant="outline" size="sm" onclick={onNext} aria-label={nextLabel}>
			{nextLabel}
			<ChevronRightIcon aria-hidden="true" />
		</Button>
	</div>
	<Button size="sm" onclick={onGoToToday}>Today</Button>
</div>
