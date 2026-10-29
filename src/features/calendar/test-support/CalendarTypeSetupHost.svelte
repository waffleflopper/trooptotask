<script lang="ts">
	import { untrack } from 'svelte';
	import CalendarTypesEmptyState from '../components/CalendarTypesEmptyState.svelte';
	import { setCalendarTypeSetup, type CalendarTypeKind, type CalendarTypeSetup } from '../components/calendarTypeSetup';

	let { kind, setup }: { kind: CalendarTypeKind; setup?: CalendarTypeSetup } = $props();

	const provided = untrack(() => setup);
	if (provided) setCalendarTypeSetup(() => provided);
</script>

<CalendarTypesEmptyState {kind} />
