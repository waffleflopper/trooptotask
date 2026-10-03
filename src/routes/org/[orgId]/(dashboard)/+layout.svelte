<script lang="ts">
	import { DashboardLoadError, dashboardWorkspaceHydrator } from '$features/dashboard';
	import type { DashboardWorkspaceResult } from '$features/dashboard/contracts';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

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
	<DashboardLoadError />
{:else}
	{@render children()}
{/if}
