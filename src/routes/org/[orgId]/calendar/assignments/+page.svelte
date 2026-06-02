<script lang="ts">
	import AssignmentPlannerPage from '$features/calendar/components/AssignmentPlannerPage.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';
	import {
		isPromiseLike,
		materializeWorkspaceData,
		observeDeferred,
		throwRenderError
	} from '$lib/utils/streamedRouteData';

	let { data } = $props();
	let calendarBootstrap = $state<WorkspaceBootstrap<CalendarBootstrap> | null>(null);
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
			calendarBootstrap = streamedCalendar as WorkspaceBootstrap<CalendarBootstrap>;
			return;
		}

		void observeDeferred(streamedCalendar, {
			fallbackMessage: 'Failed to load assignment planner workspace',
			onResolve: (calendar) => {
				calendarBootstrap = calendar;
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
	const renderLoadError = $derived.by(() => {
		if (loadError) {
			throwRenderError(loadError, 'Failed to load assignment planner workspace');
		}
		return null;
	});

	const pageData = $derived.by(() => ({
		orgId: resolvedData.orgId,
		orgName: resolvedData.orgName,
		calendar: resolvedData.calendar ? { data: resolvedData.calendar.data } : undefined
	}));
</script>

<svelte:head>
	<title>Assignment Planner - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section
		class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
		aria-busy="true"
		aria-live="polite"
		role="status"
	>
		<Spinner />
		<p class="m-0">Loading assignment planner...</p>
	</section>
{:else}
	<AssignmentPlannerPage data={pageData} />
{/if}
