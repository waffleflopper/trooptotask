<script lang="ts">
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import { untrack } from 'svelte';
	import { RangeCalendar } from './index.js';

	let { bounded = false, initialDate = new CalendarDate(2026, 9, 28) }: { bounded?: boolean; initialDate?: DateValue } =
		$props();
	let value = $state<{ start: DateValue | undefined; end: DateValue | undefined }>({
		start: undefined,
		end: undefined
	});
	let placeholder = $state<DateValue>(untrack(() => initialDate));
	let notifiedRange = $state({ start: '', end: '' });
	let notifiedViewDate = $state('');
</script>

<RangeCalendar
	bind:value
	bind:placeholder
	onValueChange={(next) => {
		notifiedRange = { start: next.start?.toString() ?? '', end: next.end?.toString() ?? '' };
	}}
	onPlaceholderChange={(next) => (notifiedViewDate = next.toString())}
	minValue={bounded ? new CalendarDate(2026, 9, 30) : undefined}
	maxValue={bounded ? new CalendarDate(2026, 10, 2) : undefined}
/>

<output aria-label="Selected start date">{value.start?.toString() ?? ''}</output>
<output aria-label="Selected end date">{value.end?.toString() ?? ''}</output>
<output aria-label="Notified start date">{notifiedRange.start}</output>
<output aria-label="Notified end date">{notifiedRange.end}</output>
<output aria-label="Notified view date">{notifiedViewDate}</output>

<button
	type="button"
	onclick={() => {
		value = { start: new CalendarDate(2026, 11, 5), end: new CalendarDate(2026, 11, 10) };
	}}
>
	Apply external date range
</button>

<button type="button" onclick={() => (placeholder = new CalendarDate(2026, 12, 15))}>View December</button>
<button
	type="button"
	onclick={() => {
		value = { start: value.start, end: new CalendarDate(2026, 11, 12) };
	}}
>
	Change external end date
</button>
