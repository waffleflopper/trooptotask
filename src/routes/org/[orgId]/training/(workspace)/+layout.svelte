<script lang="ts">
	import { trainingWorkspaceHydrator } from '$features/training';
	import type { TrainingWorkspaceResult, TrainingWorkspaceRestricted } from '$features/training/contracts';
	import { HeldWorkspace, workspaceScope } from '$lib/utils/heldWorkspace.svelte';
	import WorkspaceAccessRestricted from '../../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	const held = new HeldWorkspace<TrainingWorkspaceResult | TrainingWorkspaceRestricted>({
		source: () => data.training?.data,
		scope: () => workspaceScope(data.shell),
		fallbackMessage: 'Failed to hydrate training workspace',
		hydrate: (training) =>
			'access' in training
				? trainingWorkspaceHydrator.restrict()
				: trainingWorkspaceHydrator.hydrate(training.hydration)
	});
	const workspace = $derived(held.current);
</script>

{#if workspace.status === 'failed'}
	<WorkspaceLoadError subject="Training" />
{:else if workspace.status === 'ready' && 'access' in workspace.value}
	<WorkspaceAccessRestricted lane="training" level="view" />
{:else}
	{#if workspace.status === 'ready' && workspace.refresh === 'failed'}
		<WorkspaceLoadError subject="Training" stale />
	{/if}
	{@render children()}
{/if}
