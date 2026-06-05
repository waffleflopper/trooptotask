<script lang="ts">
	import BulkStatusPage from '$features/calendar/components/BulkStatusPage.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { CalendarWorkspaceResult } from '$features/calendar/server/calendarWorkspaceBootstrap';
	import {
		isPromiseLike,
		materializeWorkspaceData,
		observeDeferred,
		throwRenderError
	} from '$lib/utils/streamedRouteData';

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
			calendarBootstrap = streamedCalendar as CalendarWorkspaceResult;
			return;
		}

		void observeDeferred(streamedCalendar, {
			fallbackMessage: 'Failed to load bulk status workspace',
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
			throwRenderError(loadError, 'Failed to load bulk status workspace');
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
	<title>Bulk Status Operations - Troop to Task</title>
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
		<p class="m-0">Loading bulk status operations...</p>
	</section>
{:else}
	<BulkStatusPage data={pageData} />
{/if}
