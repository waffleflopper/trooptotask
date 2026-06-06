<script lang="ts">
	import { dashboardWorkspaceHydrator } from '$features/dashboard/dashboardWorkspaceHydration.svelte';
	import type { DashboardWorkspaceResult } from '$features/dashboard/server/dashboardWorkspaceBootstrap';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate dashboard workspace');
		}
		return null;
	});

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
	{renderHydrationError}
{:else}
	{@render children()}
{/if}
