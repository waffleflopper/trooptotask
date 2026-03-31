<script lang="ts">
	import BulkStatusPage from '$features/calendar/components/BulkStatusPage.svelte';

	let { data } = $props();

	const pageData = $derived.by(() => ({
		orgId: data.orgId,
		orgName: data.orgName,
		calendar: data.calendar ? { data: data.calendar.data } : undefined,
		scopedGroupId: data.scopedGroupId
	}));
</script>

<svelte:head>
	<title>Bulk Status Operations - Troop to Task</title>
</svelte:head>

<BulkStatusPage data={pageData} />
