<script lang="ts">
	import { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
	import type { CalendarPageData } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { CalendarWorkspaceResult } from '$features/calendar/server/calendarWorkspaceBootstrap';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { buildCalendarAnchorCookie } from '$features/calendar/utils/calendarAnchorDate';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';
	import { untrack } from 'svelte';

	let { data } = $props();

	const org = getOrgContext();
	const rangeCoordinator = new CalendarRangeCoordinator();
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	let calendarBootstrap = $state<CalendarWorkspaceResult | null>(null);
	let loadError = $state<Error | null>(null);
	const renderLoadError = $derived.by(() => {
		if (loadError) {
			throwRenderError(loadError, 'Failed to load calendar workspace');
		}
		return null;
	});

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
			fallbackMessage: 'Failed to load calendar workspace',
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

		if (!bootstrap) {
			return;
		}

		void rangeCoordinator.loadVisibleRange({
			orgId: data.shell.org.id,
			canViewCalendar: org.hasCapability('calendar', 'view'),
			currentDate: calendarStore.currentDate,
			viewMode: ctx.viewMode
		});

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
			userPreferences: shell?.preferences,
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
	const ctx = new CalendarPageContext(() => pageData, org);
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
				ctx.closeAvailabilityModal();
				ctx.closeAssignmentModal();
			});
		}
		activeAccessKey = nextAccessKey;
	});

	$effect(() => {
		document.cookie = buildCalendarAnchorCookie(calendarStore.currentDate);
	});

	$effect(() => {
		const preferences = pageData.userPreferences;
		untrack(() => ctx.syncUserPreferences(preferences));
	});
	$effect(() => {
		ctx.markCalendarVisited();
	});
</script>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="grid gap-4 p-5 sm:px-6 sm:pb-6" aria-busy="true" aria-live="polite" role="status">
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
	<CalendarPageView {ctx} data={viewData} />
	{#if rangeCoordinator.loading}
		<section
			class="mx-3 mb-3 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 sm:mx-6 sm:mb-6"
			aria-live="polite"
			role="status"
		>
			<p class="m-0 text-sm text-foreground">Loading additional calendar dates...</p>
		</section>
	{:else if rangeCoordinator.error}
		<section
			class="mx-3 mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 sm:mx-6 sm:mb-6"
			aria-live="polite"
			role="status"
		>
			<p class="m-0 text-sm text-foreground">Additional calendar data is temporarily unavailable.</p>
			<Button
				variant="outline"
				size="sm"
				onclick={() => {
					rangeCoordinator.retryFailedRange();
				}}
			>
				Retry calendar load
			</Button>
		</section>
	{/if}
{/if}
