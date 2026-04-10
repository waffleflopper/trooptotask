<script lang="ts">
	import { orgShellCoordinator } from '$lib/orgShellCoordinator.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	const coordinator = orgShellCoordinator;

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate dashboard workspace');
		}
		return null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedDashboard = data.dashboard?.data;

		hydrationError = null;

		if (!streamedDashboard) {
			return;
		}

		if (!isPromiseLike(streamedDashboard)) {
			void observeDeferred(
				coordinator.hydrate((streamedDashboard as WorkspaceBootstrap<DashboardBootstrap>).hydration),
				{
					fallbackMessage: 'Failed to hydrate dashboard workspace',
					onReject: (error) => {
						hydrationError = error;
					},
					isCancelled: () => cancelled
				}
			);
			return;
		}

		void observeDeferred(
			streamedDashboard.then((dashboard: WorkspaceBootstrap<DashboardBootstrap>) =>
				coordinator.hydrate(dashboard.hydration)
			),
			{
				fallbackMessage: 'Failed to hydrate dashboard workspace',
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
