<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import CalendarReports from '$features/calendar/components/reports/CalendarReports.svelte';

	let { data } = $props();
</script>

<div class="page">
	<PageToolbar title="Calendar Reports" />

	<main class="page-content">
		<CalendarReports
			orgId={data.orgId}
			personnel={data.allPersonnel ?? []}
			statusTypes={data.statusTypes ?? []}
			groups={data.groups ?? []}
		/>
	</main>
</div>

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}
</style>
