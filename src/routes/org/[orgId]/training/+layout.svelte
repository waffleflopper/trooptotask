<script lang="ts">
	import { orgShellCoordinator } from '$lib/orgShellCoordinator.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	const coordinator = orgShellCoordinator;

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate training workspace');
		}
		return null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedTraining = data.training?.data;

		hydrationError = null;

		if (!streamedTraining) {
			return;
		}

		if (!isPromiseLike(streamedTraining)) {
			void observeDeferred(coordinator.hydrate((streamedTraining as WorkspaceBootstrap<TrainingBootstrap>).hydration), {
				fallbackMessage: 'Failed to hydrate training workspace',
				onReject: (error) => {
					hydrationError = error;
				},
				isCancelled: () => cancelled
			});
			return;
		}

		void observeDeferred(
			streamedTraining.then((training: WorkspaceBootstrap<TrainingBootstrap>) =>
				coordinator.hydrate(training.hydration)
			),
			{
				fallbackMessage: 'Failed to hydrate training workspace',
				onReject: (error) => {
					hydrationError = error;
				},
				isCancelled: () => cancelled
			}
		);

		return () => {
			cancelled = true;
		};
	});
</script>

{#if hydrationError}
	{renderHydrationError}
{:else}
	{@render children()}
{/if}
