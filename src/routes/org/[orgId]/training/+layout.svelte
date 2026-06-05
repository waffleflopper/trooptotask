<script lang="ts">
	import { trainingWorkspaceHydrator } from '$features/training/trainingWorkspaceHydration.svelte';
	import type { TrainingWorkspaceResult } from '$features/training/server/trainingWorkspaceBootstrap';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate training workspace');
		}
		return null;
	});

	$effect(() => {
		hydrationError = null;

		return hydrateStreamedWorkspace<TrainingWorkspaceResult>({
			streamedWorkspace: data.training,
			fallbackMessage: 'Failed to hydrate training workspace',
			hydrate: (training) => trainingWorkspaceHydrator.hydrate(training.hydration),
			onReject: (error) => {
				hydrationError = error;
			}
		});
	});
</script>

{#if hydrationError}
	{renderHydrationError}
{:else}
	{@render children()}
{/if}
