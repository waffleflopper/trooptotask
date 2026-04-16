<script lang="ts">
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import IctReportsView from '$features/critical-tasks/components/IctReportsView.svelte';

	let { data } = $props();
	const org = getOrgContext();

	const storesHydratedForOrg = $derived(
		personnelStore.orgId === org.orgId &&
			groupsStore.orgId === org.orgId &&
			ictTasksStore.orgId === org.orgId &&
			personnelIctCompletionsStore.orgId === org.orgId
	);
	const loading = $derived(
		!storesHydratedForOrg ||
			personnelStore.loading ||
			groupsStore.loading ||
			ictTasksStore.loading ||
			personnelIctCompletionsStore.loading
	);
</script>

<svelte:head>
	<title>Critical Task Reports - Troop to Task</title>
</svelte:head>

{#if loading}
	<section class="route-loading" aria-busy="true" aria-live="polite" role="status">
		<Spinner color="currentColor" />
		<p>Loading critical task reports...</p>
	</section>
{:else}
	<IctReportsView
		orgId={org.orgId}
		personnel={personnelStore.items}
		groups={groupsStore.items}
		tasks={ictTasksStore.items}
		completions={personnelIctCompletionsStore.items}
		settings={data.criticalTasksSettings}
	/>
{/if}

<style>
	.route-loading {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		justify-content: center;
		padding: var(--sp-6);
		color: var(--text-secondary);
	}

	.route-loading p {
		margin: 0;
	}
</style>
