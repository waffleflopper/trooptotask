<script lang="ts">
	import { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const ctx = new CalendarPageContext(() => data, org);

	$effect(() => {
		ctx.initBreakdownPreference();
	});
	$effect(() => {
		ctx.initFromStorage();
	});
	$effect(() => {
		ctx.markCalendarVisited();
	});
</script>

<CalendarPageView {ctx} {data} />
