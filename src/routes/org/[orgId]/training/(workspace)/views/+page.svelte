<script lang="ts">
	import { trainingTypesStore } from '$features/training';
	import { trainingViewsStore } from '$features/training';
	import TrainingViewsPage from '$features/training/components/TrainingViewsPage.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { getAppShellContext } from '$features/app-shell';
	import type { TrainingWorkspaceResult } from '$features/training/contracts';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';

	let { data } = $props();
	const org = getAppShellContext();
	let trainingBootstrap = $state<TrainingWorkspaceResult | null>(null);
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
			trainingBootstrap = streamedTraining as TrainingWorkspaceResult;
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
</script>

<svelte:head>
	<title>Training Views - Troop to Task</title>
</svelte:head>

{#if workspacePending}
	<section class="flex items-center justify-center gap-2 p-6 text-muted-foreground" aria-live="polite" role="status">
		<Spinner class="size-4" />
		<p>Loading training views...</p>
	</section>
{:else if !loadError}
	<div class="h-full min-h-0 overflow-hidden">
		<TrainingViewsPage {org} />
	</div>
{/if}
