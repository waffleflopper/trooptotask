<script lang="ts">
	import { calendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
	import type { CalendarWorkspaceResult, CalendarWorkspaceRestricted } from '$features/calendar';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import WorkspaceAccessRestricted from '../WorkspaceAccessRestricted.svelte';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	let accessRestricted = $state(false);
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate calendar workspace');
		}
		return null;
	});

	$effect(() => {
		hydrationError = null;
		accessRestricted = false;

		return hydrateStreamedWorkspace<CalendarWorkspaceResult | CalendarWorkspaceRestricted>({
			streamedWorkspace: data.calendar,
			fallbackMessage: 'Failed to hydrate calendar workspace',
			hydrate: (calendar) => {
				if ('access' in calendar) {
					calendarWorkspaceHydrator.restrict();
					accessRestricted = true;
					return;
				}
				return calendarWorkspaceHydrator.hydrate(calendar.hydration);
			},
			onReject: (error) => {
				hydrationError = error;
			}
		});
	});
</script>

{#if hydrationError}
	{renderHydrationError}
{:else if accessRestricted}
	<WorkspaceAccessRestricted />
{:else}
	{@render children()}
{/if}
