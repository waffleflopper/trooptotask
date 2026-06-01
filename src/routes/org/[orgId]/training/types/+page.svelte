<script lang="ts">
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { rosterStore } from '$lib/stores/roster.svelte';
	import TrainingTypesPage from '$features/training/components/TrainingTypesPage.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { TrainingBootstrap } from '$lib/server/core/orgShell';
	import { isPromiseLike, materializeWorkspaceData, throwRenderError } from '$lib/utils/streamedRouteData';

	let { data } = $props();
	const org = getOrgContext();

	const streamedTraining = $derived(data.training?.data);
	const immediateTrainingBootstrap = $derived.by(() =>
		streamedTraining && !isPromiseLike(streamedTraining)
			? (streamedTraining as WorkspaceBootstrap<TrainingBootstrap>)
			: null
	);
	const storesHydratedForOrg = $derived(rosterStore.orgId === org.orgId && trainingTypesStore.orgId === org.orgId);
	const storesPending = $derived(!storesHydratedForOrg || rosterStore.loading || trainingTypesStore.loading);
	const immediateWorkspacePending = $derived(!!immediateTrainingBootstrap && storesPending);
	const pageData = $derived.by(() => pageDataFor(immediateTrainingBootstrap));

	function pageDataFor(trainingBootstrap: WorkspaceBootstrap<TrainingBootstrap> | null | undefined) {
		return materializeWorkspaceData(data, 'training', trainingBootstrap);
	}
</script>

<svelte:head>
	<title>Training Types - Troop to Task</title>
</svelte:head>

{#if streamedTraining && isPromiseLike(streamedTraining)}
	{#await streamedTraining}
		<section
			class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
			aria-busy="true"
			aria-live="polite"
			role="status"
		>
			<Spinner class="size-4" />
			<p>Loading training types...</p>
		</section>
	{:then resolvedTraining}
		{#if storesPending}
			<section
				class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
				aria-busy="true"
				aria-live="polite"
				role="status"
			>
				<Spinner class="size-4" />
				<p>Loading training types...</p>
			</section>
		{:else}
			<div class="h-full min-h-0 overflow-hidden">
				<TrainingTypesPage data={pageDataFor(resolvedTraining)} />
			</div>
		{/if}
	{:catch error}
		{throwRenderError(error, 'Failed to load training types workspace')}
	{/await}
{:else if immediateWorkspacePending}
	<section
		class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
		aria-busy="true"
		aria-live="polite"
		role="status"
	>
		<Spinner class="size-4" />
		<p>Loading training types...</p>
	</section>
{:else}
	<div class="h-full min-h-0 overflow-hidden">
		<TrainingTypesPage data={pageData} />
	</div>
{/if}
