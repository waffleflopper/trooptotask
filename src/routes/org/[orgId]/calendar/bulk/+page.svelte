<script lang="ts">
	import BulkStatusPage from '$features/calendar/components/BulkStatusPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Bulk Status Operations - Troop to Task</title>
</svelte:head>

<BulkStatusPage {data} />
