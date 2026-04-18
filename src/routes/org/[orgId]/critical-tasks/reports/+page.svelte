<script lang="ts">
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import IctReportsView from '$features/critical-tasks/components/IctReportsView.svelte';

	let { data } = $props();
	const org = getOrgContext();

	const storesHydratedForOrg = $derived(
		personnelStore.orgId === org.orgId && groupsStore.orgId === org.orgId && ictTasksStore.orgId === org.orgId
	);
	const loading = $derived(
		!storesHydratedForOrg || personnelStore.loading || groupsStore.loading || ictTasksStore.loading
	);
	const reportPersonnel = $derived(storesHydratedForOrg ? personnelStore.items : []);
	const reportGroups = $derived(storesHydratedForOrg ? groupsStore.items : []);
	const reportTasks = $derived(storesHydratedForOrg ? ictTasksStore.items : []);
</script>

<svelte:head>
	<title>Critical Task Reports - Troop to Task</title>
</svelte:head>

<IctReportsView
	orgId={org.orgId}
	personnel={reportPersonnel}
	groups={reportGroups}
	tasks={reportTasks}
	initialDashboard={data.initialDashboard}
	{loading}
/>
