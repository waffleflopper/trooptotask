<script lang="ts">
	import { getAccountPreferencesContext } from '$features/identity';
	import {
		CalendarPageContext,
		calendarViewCoverage,
		calendarStore,
		type CalendarPageData,
		type CalendarWorkspaceResult
	} from '$features/calendar';
	import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
	import { untrack } from 'svelte';

	let { data } = $props();

	const org = getAppShellContext();
	const preferences = getAccountPreferencesContext();
	const rangeCoordinator = new CalendarRangeCoordinator();
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
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
			fallbackMessage: 'Failed to load calendar workspace',
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

	$effect(() => {
		const bootstrap = calendarBootstrap?.data;
		if (!bootstrap) {
			rangeCoordinator.reset();
			return;
		}

		rangeCoordinator.includeBootstrap(bootstrap);
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

	const workspacePending = $derived(!!data.calendar?.data && calendarBootstrap === null && loadError === null);
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
			activeOnboardingPersonnelIds: calendarBootstrap?.data.activeOnboardingPersonnelIds
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
	const viewCoverage = $derived(calendarViewCoverage(calendarStore.currentDate, ctx.viewMode));
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

{#if loadError}
	<!-- The Calendar layout observes this same source and shows WorkspaceLoadError. -->
{:else if workspacePending}
	<section class="grid gap-4 p-5 sm:px-6 sm:pb-6" aria-live="polite" role="status">
		<div class="flex flex-wrap items-center gap-3">
			<Skeleton class="h-3 w-34" />
			<Skeleton class="h-3 w-22" />
		</div>
		<Skeleton class="h-24 w-full rounded-lg" />
		<div class="grid grid-cols-7 gap-1">
			{#each { length: 49 }, index (index)}
				<Skeleton class="h-20 rounded-md" />
			{/each}
		</div>
	</section>
{:else}
	<CalendarPageView
		{ctx}
		data={viewData}
		rangeStatus={rangeCoordinator.status(viewCoverage)}
		onRetryRange={() => rangeCoordinator.retryFailedRange()}
	/>
{/if}
