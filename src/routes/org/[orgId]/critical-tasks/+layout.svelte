<script lang="ts">
	import { criticalTasksWorkspaceHydrator } from '$features/critical-tasks/criticalTasksWorkspaceHydration.svelte';
	import type { CriticalTasksWorkspaceResult } from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate Critical Tasks workspace');
		}
		return null;
	});

	$effect(() => {
		hydrationError = null;

		return hydrateStreamedWorkspace<CriticalTasksWorkspaceResult>({
			streamedWorkspace: data.criticalTasks,
			fallbackMessage: 'Failed to hydrate Critical Tasks workspace',
			hydrate: (criticalTasks) => criticalTasksWorkspaceHydrator.hydrate(criticalTasks.hydration),
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
