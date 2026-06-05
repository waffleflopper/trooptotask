<script lang="ts">
	import { calendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
	import type { CalendarWorkspaceResult } from '$features/calendar/server/calendarWorkspaceBootstrap';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate calendar workspace');
		}
		return null;
	});

	$effect(() => {
		hydrationError = null;

		return hydrateStreamedWorkspace<CalendarWorkspaceResult>({
			streamedWorkspace: data.calendar,
			fallbackMessage: 'Failed to hydrate calendar workspace',
			hydrate: (calendar) => calendarWorkspaceHydrator.hydrate(calendar.hydration),
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
