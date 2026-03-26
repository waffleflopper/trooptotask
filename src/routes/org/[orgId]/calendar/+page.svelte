<script lang="ts">
	import { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';
	import CalendarModals from '$features/calendar/components/CalendarModals.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	const ctx = new CalendarPageContext(() => data, modals, org);

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

<CalendarPageView {ctx} {modals} {data} />
<CalendarModals {ctx} {modals} orgId={data.orgId} />
