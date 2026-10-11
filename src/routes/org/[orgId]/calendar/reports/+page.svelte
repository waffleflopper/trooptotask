<script lang="ts">
	import CalendarReports from '$features/calendar/components/reports/CalendarReports.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Calendar Reports - Troop to Task</title>
</svelte:head>

<div class="h-full bg-background p-3 sm:px-6 sm:pt-4 sm:pb-6">
	<CalendarReports
		orgId={data.shell.org.id}
		orgUrlSegment={data.shell.org.urlSegment}
		personnel={data.allPersonnel ?? []}
		statusTypes={data.statusTypes ?? []}
		groups={data.groups ?? []}
	/>
</div>
