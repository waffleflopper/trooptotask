<script lang="ts">
	import {
		criticalTasksWorkspaceHydrator,
		markCriticalTasksWorkspacePending,
		markCriticalTasksWorkspaceRejected,
		markCriticalTasksWorkspaceResolved
	} from '$features/critical-tasks/criticalTasksWorkspaceHydration.svelte';
	import type { CriticalTasksWorkspaceResult } from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	let workspacePending = $state(false);
	const orgId = $derived(typeof data.orgId === 'string' ? data.orgId : null);
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
			onPending: () => {
				workspacePending = true;
				markCriticalTasksWorkspacePending(orgId);
			},
			onResolved: (criticalTasks) => {
				workspacePending = false;
				markCriticalTasksWorkspaceResolved(criticalTasks);
			},
			hydrate: (criticalTasks) => criticalTasksWorkspaceHydrator.hydrate(criticalTasks.hydration),
			onReject: (error) => {
				workspacePending = false;
				hydrationError = error;
				markCriticalTasksWorkspaceRejected(error, orgId);
			}
		});
	});
</script>

{#if hydrationError}
	{renderHydrationError}
{:else if !workspacePending}
	{@render children()}
{/if}
