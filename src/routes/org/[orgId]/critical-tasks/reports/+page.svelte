<script lang="ts">
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import IctReportsView from '$features/critical-tasks/components/IctReportsView.svelte';

	let { data } = $props();
	const org = getOrgContext();
</script>

<svelte:head>
	<title>Critical Task Reports - Troop to Task</title>
</svelte:head>

<IctReportsView orgId={org.orgId} reportScope={data.reportScope} initialDashboard={data.initialDashboard} />
