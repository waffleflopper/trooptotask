<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import TrainingReportsPage from '$features/training/components/TrainingReportsPage.svelte';
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
			fallbackMessage: 'Failed to load training reports workspace',
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

	const hasServerReport = $derived(!!data.trainingReport);
	const routePending = $derived(
		!hasServerReport && !!data.training?.data && trainingBootstrap === null && loadError === null
	);
	const storesHydratedForOrg = $derived(
		personnelStore.orgId === org.orgId &&
			groupsStore.orgId === org.orgId &&
			trainingTypesStore.orgId === org.orgId &&
			personnelTrainingsStore.orgId === org.orgId
	);
	const storesPending = $derived(
		!storesHydratedForOrg ||
			personnelStore.loading ||
			groupsStore.loading ||
			trainingTypesStore.loading ||
			personnelTrainingsStore.loading
	);
	const workspacePending = $derived(!hasServerReport && (routePending || (!!trainingBootstrap && storesPending)));
	const pageData = $derived.by(() => materializeWorkspaceData(data, 'training', trainingBootstrap));
	const renderLoadError = $derived.by(() => {
		if (loadError) {
			throwRenderError(loadError, 'Failed to load training reports workspace');
		}
		return null;
	});
</script>

<svelte:head>
	<title>Training Reports - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="route-loading" aria-busy="true" aria-live="polite" role="status">
		<Spinner color="currentColor" />
		<p>Loading training reports...</p>
	</section>
{:else}
	<TrainingReportsPage data={pageData} />
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
