<script lang="ts">
	import { getAccountPreferencesContext } from '$features/identity';
	import {
		CalendarPageContext,
		calendarViewCoverage,
		calendarStore,
		CalendarWorkspaceSkeleton,
		type CalendarPageData,
		type CalendarWorkspaceResult,
		type CalendarWorkspaceRestricted
	} from '$features/calendar';
	import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import { HeldWorkspace, workspaceScope } from '$lib/utils/heldWorkspace.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();

	const org = getAppShellContext();
	const preferences = getAccountPreferencesContext();
	const rangeCoordinator = new CalendarRangeCoordinator();
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const held = new HeldWorkspace<CalendarWorkspaceResult | CalendarWorkspaceRestricted>({
		source: () => data.calendar?.data,
		scope: () => workspaceScope(data.shell),
		fallbackMessage: 'Failed to load calendar workspace'
	});
	const calendarBootstrap = $derived(held.value && !('access' in held.value) ? held.value : null);

	// A refreshed workspace is current only for the dates it carries, so every other loaded range is read again.
	$effect(() => {
		const bootstrap = calendarBootstrap?.data;
		rangeCoordinator.reset();
		if (bootstrap) rangeCoordinator.includeBootstrap(bootstrap);
	});

	$effect(() => {
		const bootstrap = calendarBootstrap?.data;
		rangeCoordinator.retryToken;

		if (!bootstrap || !org.hasCapability('calendar', 'view')) {
			return;
		}

		void rangeCoordinator.ensureRange(data.shell.org.id, viewCoverage);

		return () => {
			rangeCoordinator.cancelInFlightLoads();
		};
	});

	const pageData = $derived.by(
		(): CalendarPageData => ({
			orgId: data.shell.org.id,
			orgName: data.shell.org.name,
			userId: shell?.user.id ?? null,
			calendar: calendarBootstrap
				? {
						data: {
							...rangeCoordinator.applyToBootstrap(calendarBootstrap.data)
						}
					}
				: undefined,
			activeOnboardingPersonnelIds: calendarBootstrap?.data.activeOnboardingPersonnelIds,
			disabledFeatures: shell?.org.disabledFeatures
		})
	);
	const viewData = $derived.by(() => ({
		orgId: pageData.orgId,
		orgUrlSegment: data.shell.org.urlSegment,
		orgName: pageData.orgName ?? 'Troop to Task'
	}));
	const ctx = new CalendarPageContext(
		() => pageData,
		org,
		(patch) => preferences.patch({ calendar: patch })
	);
	ctx.syncUserPreferences(untrack(() => preferences.value.calendar));
	// Events load with the visible range, sharing its read, but only behind the Events & Taskings switch.
	const viewCoverage = $derived.by(() => {
		const base = calendarViewCoverage(calendarStore.focusDay, ctx.viewMode);
		return ctx.showEvents ? { ...base, events: base.assignments } : base;
	});
	let activeAccessKey: string | null = null;

	$effect(() => {
		const nextAccessKey = JSON.stringify([
			data.shell.org.id,
			shell?.user.id,
			org.role,
			org.capabilityMap.calendar,
			org.scopeSet
		]);
		if (activeAccessKey !== null && activeAccessKey !== nextAccessKey) {
			untrack(() => {
				ctx.closePopover();
				ctx.closeEditor();
				ctx.closeAssignmentModal();
			});
		}
		activeAccessKey = nextAccessKey;
	});

	$effect(() => {
		const calendarPreferences = preferences.value.calendar;
		untrack(() => ctx.syncUserPreferences(calendarPreferences));
	});
</script>

{#if held.current.status === 'failed'}
	<!-- The Calendar layout observes this same source and shows WorkspaceLoadError. -->
{:else if held.current.status === 'pending'}
	<CalendarWorkspaceSkeleton shape="grid" />
{:else}
	<CalendarPageView
		{ctx}
		data={viewData}
		rangeStatus={rangeCoordinator.status(viewCoverage)}
		onRetryRange={() => rangeCoordinator.retryFailedRange()}
		projection={rangeCoordinator.projection}
		projectionStatus={rangeCoordinator.projectionStatus(viewCoverage)}
		onRetryProjection={() => rangeCoordinator.retryFailedRange()}
		taskingFacts={rangeCoordinator.taskingFacts}
		onTaskingsChanged={() => rangeCoordinator.rereadEvents(data.shell.org.id)}
	/>
{/if}
