<script lang="ts">
	import { calendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
	import type { CalendarWorkspaceResult, CalendarWorkspaceRestricted } from '$features/calendar';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import WorkspaceAccessRestricted from '../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	const workspace = $derived(data.calendar?.data);
	let settled = $state.raw<{ workspace: unknown; error: Error | null; accessRestricted: boolean } | null>(null);
	const current = $derived(settled?.workspace === workspace ? settled : null);

	$effect(() => {
		const requestedWorkspace = workspace;
		let cancelled = false;

		const cancelObserver = hydrateStreamedWorkspace<CalendarWorkspaceResult | CalendarWorkspaceRestricted>({
			streamedWorkspace: { data: requestedWorkspace },
			fallbackMessage: 'Failed to hydrate calendar workspace',
			hydrate: async (calendar) => {
				if ('access' in calendar) {
					calendarWorkspaceHydrator.restrict();
				} else {
					await calendarWorkspaceHydrator.hydrate(calendar.hydration);
				}
				if (!cancelled) {
					settled = { workspace: requestedWorkspace, error: null, accessRestricted: 'access' in calendar };
				}
			},
			onReject: (error) => {
				if (!cancelled) settled = { workspace: requestedWorkspace, error, accessRestricted: false };
			}
		});
		return () => {
			cancelled = true;
			cancelObserver();
			calendarWorkspaceHydrator.reset();
		};
	});
</script>

{#if current?.error}
	<WorkspaceLoadError subject="Calendar" />
{:else if current?.accessRestricted}
	<WorkspaceAccessRestricted />
{:else if current || workspace == null}
	{@render children()}
{:else}
	<section class="grid gap-4 p-5 sm:px-6 sm:pb-6" role="status" aria-live="polite">
		<p class="m-0 text-sm text-muted-foreground">Loading Calendar data</p>
		<Skeleton class="h-24 w-full rounded-lg" aria-hidden="true" />
	</section>
{/if}
