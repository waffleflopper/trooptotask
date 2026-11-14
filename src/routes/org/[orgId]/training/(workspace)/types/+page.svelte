<script lang="ts">
	import { trainingTypesStore } from '$features/training';
	import { getAppShellContext } from '$features/app-shell';
	import { rosterStore } from '$features/personnel';
	import TrainingTypesPage from '$features/training/components/TrainingTypesPage.svelte';
	import type { TrainingWorkspaceResult, TrainingWorkspaceRestricted } from '$features/training/contracts';
	import { HeldWorkspace, workspaceScope } from '$lib/utils/heldWorkspace.svelte';
	import { materializeWorkspaceData } from '$lib/utils/streamedRouteData';

	let { data } = $props();
	const org = getAppShellContext();

	const scope = $derived(workspaceScope(data.shell));
	const held = new HeldWorkspace<TrainingWorkspaceResult | TrainingWorkspaceRestricted>({
		source: () => data.training?.data,
		scope: () => scope,
		fallbackMessage: 'Failed to load training workspace'
	});
	const trainingBootstrap = $derived(held.value && !('access' in held.value) ? held.value : null);
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

{#if held.current.status === 'failed'}
	<!-- The Training layout observes this same source and shows WorkspaceLoadError. -->
{:else}
	<!-- One page per scope: a refresh updates it in place, and another Organization starts a new one. -->
	{#key scope}
		<TrainingTypesPage
			{org}
			{orgName}
			data={pageDataFor(trainingBootstrap)}
			loading={held.current.status === 'pending' || (!!trainingBootstrap && storesPending)}
		/>
	{/key}
{/if}
