<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	const org = getAppShellContext();
	import { Spinner } from '$lib/components/ui/spinner';
	import AssignmentPlannerPage from '$features/calendar/components/AssignmentPlannerPage.svelte';
	import type { CalendarWorkspaceResult } from '$features/calendar';
	import { isPromiseLike, materializeWorkspaceData, observeDeferred } from '$lib/utils/streamedRouteData';

	let { data } = $props();
	let calendarBootstrap = $state<CalendarWorkspaceResult | null>(null);
	let loadError = $state<Error | null>(null);

	$effect(() => {
		let cancelled = false;
		const streamedCalendar = data.calendar?.data;

		calendarBootstrap = null;
		loadError = null;

		if (!streamedCalendar) {
			return;
		}

		if (!isPromiseLike(streamedCalendar)) {
			calendarBootstrap = 'access' in streamedCalendar ? null : streamedCalendar;
			return;
		}

		void observeDeferred(streamedCalendar, {
			fallbackMessage: 'Failed to load assignment planner workspace',
			onResolve: (calendar) => {
				calendarBootstrap = 'access' in calendar ? null : calendar;
			},
			onReject: (error) => {
				loadError = error;
			},
			isCancelled: () => cancelled
		});

		return () => {
			cancelled = true;
		};
	});

	const workspacePending = $derived(!!data.calendar?.data && calendarBootstrap === null && loadError === null);
	const resolvedData = $derived.by(() => materializeWorkspaceData(data, 'calendar', calendarBootstrap));

	const pageData = $derived.by(() => ({
		orgId: data.shell.org.id,
		orgName: data.shell.org.name,
		calendar: resolvedData.calendar ? { data: resolvedData.calendar.data } : undefined
	}));
</script>

<svelte:head>
	<title>Assignment Planner - Troop to Task</title>
</svelte:head>

{#if loadError}
	<!-- The Calendar layout observes this same source and shows WorkspaceLoadError. -->
{:else if workspacePending}
	<section class="flex items-center justify-center gap-2 p-6 text-muted-foreground" aria-live="polite" role="status">
		<Spinner />
		<p class="m-0">Loading assignment planner...</p>
	</section>
{:else}
	<AssignmentPlannerPage {org} data={pageData} />
{/if}
