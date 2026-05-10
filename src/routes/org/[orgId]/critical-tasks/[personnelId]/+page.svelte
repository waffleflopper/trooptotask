<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner';
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
	<section
		class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
		aria-busy="true"
		aria-live="polite"
		role="status"
	>
		<Spinner />
		<p>Loading critical task record...</p>
	</section>
{:else}
	<IctPersonnelDetailPage {data} />
{/if}
