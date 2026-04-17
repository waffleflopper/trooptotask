<script lang="ts">
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import IctPersonnelDetailPage from '$features/critical-tasks/components/IctPersonnelDetailPage.svelte';

	let { data } = $props();
	const org = getOrgContext();

	const storesHydratedForOrg = $derived(
		ictTasksStore.orgId === org.orgId && personnelIctCompletionsStore.orgId === org.orgId
	);
	const loading = $derived(!storesHydratedForOrg || ictTasksStore.loading || personnelIctCompletionsStore.loading);
</script>

{#if loading}
	<section class="route-loading" aria-busy="true" aria-live="polite" role="status">
		<Spinner color="currentColor" />
		<p>Loading critical task record...</p>
	</section>
{:else}
	<IctPersonnelDetailPage {data} />
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
