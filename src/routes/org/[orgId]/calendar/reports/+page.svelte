<script lang="ts">
	import CalendarReports from '$features/calendar/components/reports/CalendarReports.svelte';

	let { data } = $props();
</script>

<div class="page">
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
		background: var(--surface-page);
	}

	.page-content {
		padding: var(--sp-4) var(--sp-6) var(--sp-6);
	}
</style>
