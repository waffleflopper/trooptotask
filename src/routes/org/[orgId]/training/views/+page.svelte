<script lang="ts">
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import TrainingViewsPage from '$features/training/components/TrainingViewsPage.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { TrainingBootstrap } from '$lib/server/core/orgShell';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

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
			fallbackMessage: 'Failed to load training views workspace',
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
	const storesHydratedForOrg = $derived(
		trainingTypesStore.orgId === org.orgId && trainingViewsStore.orgId === org.orgId
	);
	const storesPending = $derived(!storesHydratedForOrg || trainingTypesStore.loading || trainingViewsStore.loading);
	const workspacePending = $derived(routePending || (!!trainingBootstrap && storesPending));
	const renderLoadError = $derived.by(() => {
		if (loadError) {
			throwRenderError(loadError, 'Failed to load training views workspace');
		}
		return null;
	});
</script>

<svelte:head>
	<title>Training Views - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section
		class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
		aria-busy="true"
		aria-live="polite"
		role="status"
	>
		<Spinner class="size-4" />
		<p>Loading training views...</p>
	</section>
{:else}
	<div class="h-full min-h-0 overflow-hidden">
		<TrainingViewsPage />
	</div>
{/if}
