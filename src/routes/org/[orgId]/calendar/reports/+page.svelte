<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import CalendarReports from '$features/calendar/components/reports/CalendarReports.svelte';

	let { data } = $props();
</script>

<PageToolbar title="Calendar Reports" />

<CalendarReports
	orgId={data.orgId}
	personnel={data.allPersonnel}
	statusTypes={data.statusTypes}
	groups={data.groups}
/>
