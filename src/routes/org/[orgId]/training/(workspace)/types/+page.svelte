<script lang="ts">
	import { trainingTypesStore } from '$features/training';
	import { getAppShellContext } from '$features/app-shell';
	import { rosterStore } from '$features/personnel';
	import TrainingTypesPage from '$features/training/components/TrainingTypesPage.svelte';
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
	const orgName = $derived(data.shell?.kind === 'ready' ? data.shell.org.name : '');

	function pageDataFor(trainingBootstrap: TrainingWorkspaceResult | null | undefined) {
		return materializeWorkspaceData(data, 'training', trainingBootstrap);
	}
</script>

<svelte:head>
	<title>Training Types - Troop to Task</title>
</svelte:head>

{#if streamedTraining && isPromiseLike(streamedTraining)}
	{#await streamedTraining}
		<TrainingTypesPage {org} {orgName} data={pageDataFor(null)} loading />
	{:then resolvedTraining}
		<TrainingTypesPage {org} {orgName} data={pageDataFor(resolvedTraining)} loading={storesPending} />
	{:catch}
		<!-- The Training layout observes this same source and shows WorkspaceLoadError. -->
	{/await}
{:else}
	<TrainingTypesPage
		{org}
		{orgName}
		data={pageDataFor(immediateTrainingBootstrap)}
		loading={!!immediateTrainingBootstrap && storesPending}
	/>
{/if}
