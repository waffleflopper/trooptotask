<script lang="ts">
	import { trainingWorkspaceHydrator } from '$features/training';
	import type { TrainingWorkspaceResult, TrainingWorkspaceRestricted } from '$features/training/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import WorkspaceAccessRestricted from '../../WorkspaceAccessRestricted.svelte';

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
	<section class="p-6 max-sm:p-2">
		<Alert.Root variant="destructive">
			<Alert.Title>Unable to load Training</Alert.Title>
			<Alert.Description>Training data could not be loaded. Please try again.</Alert.Description>
			<div class="mt-3">
				<Button variant="outline" onclick={() => window.location.reload()}>Retry Training</Button>
			</div>
		</Alert.Root>
	</section>
{:else if accessRestricted}
	<WorkspaceAccessRestricted subject="training" />
{:else}
	{@render children()}
{/if}
