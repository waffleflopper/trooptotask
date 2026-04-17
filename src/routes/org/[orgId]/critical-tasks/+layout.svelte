<script lang="ts">
	import { orgShellCoordinator } from '$lib/orgShellCoordinator.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { CriticalTasksBootstrap } from '$lib/server/core/useCases/criticalTasksQuery';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	const coordinator = orgShellCoordinator;

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate Critical Tasks workspace');
		}
		return null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedCriticalTasks = data.criticalTasks?.data;

		hydrationError = null;

		if (!streamedCriticalTasks) {
			return;
		}

		if (!isPromiseLike(streamedCriticalTasks)) {
			void observeDeferred(
				coordinator.hydrate((streamedCriticalTasks as WorkspaceBootstrap<CriticalTasksBootstrap>).hydration),
				{
					fallbackMessage: 'Failed to hydrate Critical Tasks workspace',
					onReject: (error) => {
						hydrationError = error;
					},
					isCancelled: () => cancelled
				}
			);
			return () => {
				cancelled = true;
			};
		}

		void observeDeferred(
			streamedCriticalTasks.then((criticalTasks: WorkspaceBootstrap<CriticalTasksBootstrap>) =>
				coordinator.hydrate(criticalTasks.hydration)
			),
			{
				fallbackMessage: 'Failed to hydrate Critical Tasks workspace',
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
