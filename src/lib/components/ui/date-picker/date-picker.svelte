<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { DateFormatter, getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import { getFieldContext } from '$lib/components/ui/field/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import type { ClassValue } from 'svelte/elements';

	interface Props {
		id?: string;
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: ClassValue;
		/** Shows only the calendar icon, for a picker beside date shortcuts. The chosen date is shown by the caller. */
		iconOnly?: boolean;
		'aria-label'?: string;
		onValueChange?: (value: string) => void;
	}

	let {
		id,
		value = $bindable(''),
		placeholder = 'Select date',
		disabled = false,
		class: className,
		iconOnly = false,
		'aria-label': ariaLabel,
		onValueChange
	}: Props = $props();

	let open = $state(false);
	const field = getFieldContext();
	const fieldAria = $derived(field?.controlAria(undefined, undefined) ?? {});
	const calendarValue = $derived(toCalendarValue(value));

	const formatter = new DateFormatter('en-US', {
		dateStyle: 'medium'
	});

	const displayValue = $derived(
		calendarValue ? formatter.format(calendarValue.toDate(getLocalTimeZone())) : placeholder
	);

	function toCalendarValue(nextValue: string): DateValue | undefined {
		if (!nextValue) return undefined;

		try {
			return parseDate(nextValue);
		} catch {
			return undefined;
		}
	}

	function handleCalendarValueChange(nextValue: DateValue | undefined) {
		value = nextValue?.toString() ?? '';
		onValueChange?.(value);
		if (nextValue) open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger {id} {disabled} aria-label={ariaLabel} {...fieldAria}>
		{#snippet child({ props })}
			{#if iconOnly}
				<Button {...props} variant="outline" size="icon-sm" class={className} {disabled}>
					<CalendarIcon />
				</Button>
			{:else}
				<Button
					{...props}
					variant="outline"
					class={cn('w-full justify-start text-left font-normal', !calendarValue && 'text-muted-foreground', className)}
					{disabled}
				>
					<CalendarIcon />
					<span class="truncate">{displayValue}</span>
				</Button>
			{/if}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto overflow-hidden p-0" align="start">
		<Calendar
			type="single"
			value={calendarValue}
			captionLayout="dropdown"
			onValueChange={(nextValue) => handleCalendarValueChange(nextValue as DateValue | undefined)}
		/>
	</Popover.Content>
</Popover.Root>
