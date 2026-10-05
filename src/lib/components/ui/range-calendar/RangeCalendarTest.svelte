<script lang="ts">
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import { RangeCalendar } from './index.js';

	let { bounded = false }: { bounded?: boolean } = $props();
	let value = $state<{ start: DateValue | undefined; end: DateValue | undefined }>({
		start: undefined,
		end: undefined
	});
	let placeholder = $state<DateValue>(new CalendarDate(2026, 9, 28));
</script>

<RangeCalendar
	bind:value
	bind:placeholder
	minValue={bounded ? new CalendarDate(2026, 9, 30) : undefined}
	maxValue={bounded ? new CalendarDate(2026, 10, 2) : undefined}
/>

<output aria-label="Selected start date">{value.start?.toString() ?? ''}</output>
<output aria-label="Selected end date">{value.end?.toString() ?? ''}</output>
