<script lang="ts">
	import { RangeCalendar as RangeCalendarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let { ref = $bindable(null), class: className, ...restProps }: RangeCalendarPrimitive.CellProps = $props();
</script>

<RangeCalendarPrimitive.Cell
	bind:ref
	class={cn(
		'relative size-(--cell-size) p-0 text-center text-sm focus-within:z-20',
		'[&:has([data-selected])]:bg-muted first:[&:has([data-selected])]:rounded-s-(--cell-radius) last:[&:has([data-selected])]:rounded-e-(--cell-radius)',
		'[&:has([data-selection-start])]:rounded-s-(--cell-radius) [&:has([data-selection-end])]:rounded-e-(--cell-radius)',
		className
	)}
	{...restProps}
/>
