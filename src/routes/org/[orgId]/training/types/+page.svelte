<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import TrainingTypesPage from '$features/training/components/TrainingTypesPage.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';
	import {
		isPromiseLike,
		materializeWorkspaceData,
		observeDeferred,
		throwRenderError
	} from '$lib/utils/streamedRouteData';

	let { data } = $props();
	const org = getOrgContext();
	let trainingBootstrap = $state<WorkspaceBootstrap<TrainingBootstrap> | null>(null);
	let loadError = $state<Error | null>(null);

	$effect(() => {
		let cancelled = false;
		const streamedTraining = data.training?.data;

		trainingBootstrap = null;
		loadError = null;

		if (!streamedTraining) {
			return;
		}

		if (!isPromiseLike(streamedTraining)) {
			trainingBootstrap = streamedTraining as WorkspaceBootstrap<TrainingBootstrap>;
			return;
		}

		void observeDeferred(streamedTraining, {
			fallbackMessage: 'Failed to load training types workspace',
			onResolve: (training) => {
				trainingBootstrap = training;
			},
			onReject: (error) => {
				loadError = error;
			},
			isCancelled: () => cancelled
		});

		return () => {
			cancelled = true;
		};
	});

	const routePending = $derived(!!data.training?.data && trainingBootstrap === null && loadError === null);
	const storesHydratedForOrg = $derived(personnelStore.orgId === org.orgId && trainingTypesStore.orgId === org.orgId);
	const storesPending = $derived(!storesHydratedForOrg || personnelStore.loading || trainingTypesStore.loading);
	const workspacePending = $derived(routePending || (!!trainingBootstrap && storesPending));
	const pageData = $derived.by(() => materializeWorkspaceData(data, 'training', trainingBootstrap));
	const renderLoadError = $derived.by(() => {
		if (loadError) {
			throwRenderError(loadError, 'Failed to load training types workspace');
		}
		return null;
	});
</script>

<svelte:head>
	<title>Training Types - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="route-loading" aria-busy="true" aria-live="polite" role="status">
		<Spinner color="currentColor" />
		<p>Loading training types...</p>
	</section>
{:else}
	<TrainingTypesPage data={pageData} />
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
