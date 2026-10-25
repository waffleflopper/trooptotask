<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import IctReportsView from '$features/critical-tasks/components/IctReportsView.svelte';

	let { data } = $props();
	const org = getAppShellContext();
</script>

<svelte:head>
	<title>Critical Task Reports - Troop to Task</title>
</svelte:head>

<IctReportsView orgId={org.orgId} reportScope={data.reportScope} initialDashboard={data.initialDashboard} />
