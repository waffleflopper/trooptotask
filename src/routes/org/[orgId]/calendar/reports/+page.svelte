<script lang="ts">
	import CalendarReports from '$features/calendar/components/reports/CalendarReports.svelte';

	let { data } = $props();
</script>

<div class="flex h-full flex-col bg-background">
	<main class="p-3 sm:px-6 sm:pt-4 sm:pb-6">
		<CalendarReports
			orgId={data.shell.org.id}
			orgUrlSegment={data.shell.org.urlSegment}
			personnel={data.allPersonnel ?? []}
			statusTypes={data.statusTypes ?? []}
			groups={data.groups ?? []}
		/>
	</main>
</div>
