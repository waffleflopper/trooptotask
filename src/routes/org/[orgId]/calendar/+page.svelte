<script lang="ts">
	import { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';
	import CalendarModals from '$features/calendar/components/CalendarModals.svelte';

	let { data } = $props();

	const ctx = new CalendarPageContext(() => data);
</script>

<CalendarPageView {ctx} {data} />
<CalendarModals {ctx} orgId={data.orgId} />
