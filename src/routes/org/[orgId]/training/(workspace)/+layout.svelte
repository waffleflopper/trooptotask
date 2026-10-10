<script lang="ts">
	import { trainingWorkspaceHydrator } from '$features/training';
	import type { TrainingWorkspaceResult, TrainingWorkspaceRestricted } from '$features/training/contracts';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import WorkspaceAccessRestricted from '../../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	let accessRestricted = $state(false);

	$effect(() => {
		hydrationError = null;
		accessRestricted = false;

		return hydrateStreamedWorkspace<TrainingWorkspaceResult | TrainingWorkspaceRestricted>({
			streamedWorkspace: data.training,
			fallbackMessage: 'Failed to hydrate training workspace',
			hydrate: (training) => {
				if ('access' in training) {
					trainingWorkspaceHydrator.restrict();
					accessRestricted = true;
					return;
				}
				return trainingWorkspaceHydrator.hydrate(training.hydration);
			},
			onReject: (error) => {
				hydrationError = error;
			}
		});
	});
</script>

{#if hydrationError}
	<WorkspaceLoadError subject="Training" />
{:else if accessRestricted}
	<WorkspaceAccessRestricted subject="training" />
{:else}
	{@render children()}
{/if}
