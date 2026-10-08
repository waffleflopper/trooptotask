<script lang="ts">
	import { calendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
	import type { CalendarWorkspaceResult, CalendarWorkspaceRestricted } from '$features/calendar';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

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
					calendarWorkspaceHydrator.restrict(data.shell.org.id);
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
	<section class="m-4 min-h-80 rounded-lg border bg-card p-6 text-card-foreground sm:m-6 sm:p-8">
		<h1 class="text-xl font-semibold">Access Restricted</h1>
		<p>You don't have permission to view this area. Contact your organization admin for access.</p>
	</section>
{:else}
	{@render children()}
{/if}
