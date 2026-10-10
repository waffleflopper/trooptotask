<script lang="ts">
	import { dashboardWorkspaceHydrator } from '$features/dashboard';
	import type { DashboardWorkspaceResult } from '$features/dashboard/contracts';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);

	$effect(() => {
		hydrationError = null;

		return hydrateStreamedWorkspace<DashboardWorkspaceResult>({
			streamedWorkspace: data.dashboard,
			fallbackMessage: 'Failed to hydrate dashboard workspace',
			hydrate: (dashboard) => dashboardWorkspaceHydrator.hydrate(dashboard.hydration),
			onReject: (error) => {
				hydrationError = error;
			}
		});
	});
</script>

{#if hydrationError}
	<WorkspaceLoadError subject="Dashboard" />
{:else}
	{@render children()}
{/if}
