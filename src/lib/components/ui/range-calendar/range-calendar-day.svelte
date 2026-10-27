<script lang="ts">
	import { RangeCalendar as RangeCalendarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let { ref = $bindable(null), class: className, ...restProps }: RangeCalendarPrimitive.DayProps = $props();
</script>

<RangeCalendarPrimitive.Day
	bind:ref
	class={cn(
		'flex size-(--cell-size) flex-col items-center justify-center gap-1 rounded-(--cell-radius) p-0 leading-none font-normal whitespace-nowrap select-none',
		'not-data-selected:hover:bg-accent/50 not-data-selected:hover:text-accent-foreground',
		'[&[data-today]:not([data-selected])]:bg-accent [&[data-today]:not([data-selected])]:text-accent-foreground',
		'data-[highlighted]:bg-muted',
		'data-[selection-start]:bg-primary data-[selection-start]:text-primary-foreground data-[selection-end]:bg-primary data-[selection-end]:text-primary-foreground',
		'[&[data-outside-month]:not([data-selected])]:text-muted-foreground',
		'data-[disabled]:text-muted-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
		'data-[unavailable]:text-muted-foreground data-[unavailable]:line-through',
		'focus:border-ring focus:ring-ring/50 focus:relative',
		className
	)}
	{...restProps}
/>
