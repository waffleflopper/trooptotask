<script lang="ts">
	import { orgShellHydrationCoordinator } from '$lib/orgShellHydrationCoordinator.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	const coordinator = orgShellHydrationCoordinator;

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate calendar workspace');
		}
		return null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedCalendar = data.calendar?.data;

		hydrationError = null;

		if (!streamedCalendar) {
			return;
		}

		if (!isPromiseLike(streamedCalendar)) {
			void observeDeferred(coordinator.hydrate((streamedCalendar as WorkspaceBootstrap<CalendarBootstrap>).hydration), {
				fallbackMessage: 'Failed to hydrate calendar workspace',
				onReject: (error) => {
					hydrationError = error;
				},
				isCancelled: () => cancelled
			});
			return () => {
				cancelled = true;
			};
		}

		void observeDeferred(
			streamedCalendar.then((calendar: WorkspaceBootstrap<CalendarBootstrap>) =>
				coordinator.hydrate(calendar.hydration)
			),
			{
				fallbackMessage: 'Failed to hydrate calendar workspace',
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
