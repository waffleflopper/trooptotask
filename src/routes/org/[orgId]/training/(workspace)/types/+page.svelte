<script lang="ts">
	import { trainingTypesStore } from '$features/training';
	import { getAppShellContext } from '$features/app-shell';
	import { rosterStore } from '$features/personnel';
	import TrainingTypesPage from '$features/training/components/TrainingTypesPage.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { TrainingWorkspaceResult } from '$features/training/contracts';
	import { isPromiseLike, materializeWorkspaceData } from '$lib/utils/streamedRouteData';

	let { data } = $props();
	const org = getAppShellContext();

	const streamedTraining = $derived(data.training?.data);
	const immediateTrainingBootstrap = $derived.by(() =>
		streamedTraining && !isPromiseLike(streamedTraining) ? (streamedTraining as TrainingWorkspaceResult) : null
	);
	const storesHydratedForOrg = $derived(rosterStore.orgId === org.orgId && trainingTypesStore.orgId === org.orgId);
	const storesPending = $derived(!storesHydratedForOrg || rosterStore.loading || trainingTypesStore.loading);
	const immediateWorkspacePending = $derived(!!immediateTrainingBootstrap && storesPending);
	const pageData = $derived.by(() => pageDataFor(immediateTrainingBootstrap));

	function pageDataFor(trainingBootstrap: TrainingWorkspaceResult | null | undefined) {
		return materializeWorkspaceData(data, 'training', trainingBootstrap);
	}
</script>

<svelte:head>
	<title>Training Types - Troop to Task</title>
</svelte:head>

{#if streamedTraining && isPromiseLike(streamedTraining)}
	{#await streamedTraining}
		<section class="flex items-center justify-center gap-2 p-6 text-muted-foreground" aria-live="polite" role="status">
			<Spinner class="size-4" />
			<p>Loading training types...</p>
		</section>
	{:then resolvedTraining}
		{#if storesPending}
			<section
				class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
				aria-live="polite"
				role="status"
			>
				<Spinner class="size-4" />
				<p>Loading training types...</p>
			</section>
		{:else}
			<div class="h-full min-h-0 overflow-hidden">
				<TrainingTypesPage {org} data={pageDataFor(resolvedTraining)} />
			</div>
		{/if}
	{:catch}
		<!-- The Training layout observes this same source and shows WorkspaceLoadError. -->
	{/await}
{:else if immediateWorkspacePending}
	<section class="flex items-center justify-center gap-2 p-6 text-muted-foreground" aria-live="polite" role="status">
		<Spinner class="size-4" />
		<p>Loading training types...</p>
	</section>
{:else}
	<div class="h-full min-h-0 overflow-hidden">
		<TrainingTypesPage {org} data={pageData} />
	</div>
{/if}
