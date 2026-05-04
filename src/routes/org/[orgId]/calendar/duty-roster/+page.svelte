<script lang="ts">
	import DutyRosterPage from '$features/duty-roster/components/DutyRosterPage.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
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
			fallbackMessage: 'Failed to load duty roster workspace',
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
			throwRenderError(loadError, 'Failed to load duty roster workspace');
		}
		return null;
	});

	const pageData = $derived.by(() => ({
		orgId: resolvedData.orgId,
		orgName: resolvedData.orgName,
		calendar: resolvedData.calendar ? { data: resolvedData.calendar.data } : undefined,
		rosterHistory: resolvedData.rosterHistory,
		advancedDutyTemplates: resolvedData.advancedDutyTemplates,
		advancedDutyEvents: resolvedData.advancedDutyEvents,
		advancedDutySnapshots: resolvedData.advancedDutySnapshots,
		advancedDutyRevisionHistory: resolvedData.advancedDutyRevisionHistory ?? [],
		advancedDutyRevisionDrafts: resolvedData.advancedDutyRevisionDrafts ?? []
	}));
</script>

<svelte:head>
	<title>Duty Roster - Troop to Task</title>
</svelte:head>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="route-loading" aria-busy="true" aria-live="polite" role="status">
		<Spinner color="currentColor" />
		<p>Loading duty roster...</p>
	</section>
{:else}
	<DutyRosterPage data={pageData} />
{/if}

<style>
	.route-loading {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		justify-content: center;
		padding: var(--sp-6);
		color: var(--text-secondary);
	}

	.route-loading p {
		margin: 0;
	}
</style>
