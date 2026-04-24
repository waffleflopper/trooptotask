<script lang="ts">
	import { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
	import type { CalendarPageData } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import { buildCalendarAnchorCookie } from '$features/calendar/utils/calendarAnchorDate';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import SkeletonLine from '$lib/components/ui/SkeletonLine.svelte';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	let { data } = $props();

	const org = getOrgContext();
	const rangeCoordinator = new CalendarRangeCoordinator();
	let calendarBootstrap = $state<WorkspaceBootstrap<CalendarBootstrap> | null>(null);
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
			calendarBootstrap = streamedCalendar as WorkspaceBootstrap<CalendarBootstrap>;
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
			orgId: data.orgId,
			canViewCalendar: data.permissions?.canViewCalendar ?? false,
			currentDate: calendarStore.currentDate,
			viewMode: ctx.viewMode
		});
	});

	const workspacePending = $derived(!!data.calendar?.data && calendarBootstrap === null && loadError === null);
	const pageData = $derived.by(
		(): CalendarPageData => ({
			orgId: data.orgId,
			orgName: data.orgName ?? 'Troop to Task',
			userId: data.userId,
			userPreferences: data.userPreferences,
			calendar: calendarBootstrap
				? {
						data: {
							...rangeCoordinator.applyToBootstrap(calendarBootstrap.data)
						}
					}
				: undefined,
			scopedGroupId: data.scopedGroupId,
			permissions: data.permissions,
			activeOnboardingPersonnelIds: calendarBootstrap?.data.activeOnboardingPersonnelIds
		})
	);
	const viewData = $derived.by(() => ({
		orgId: pageData.orgId,
		orgName: pageData.orgName ?? 'Troop to Task',
		permissions: pageData.permissions
	}));
	const ctx = new CalendarPageContext(() => pageData, org);

	$effect(() => {
		document.cookie = buildCalendarAnchorCookie(calendarStore.currentDate);
	});

	$effect(() => {
		ctx.syncUserPreferences(pageData.userPreferences);
	});
	$effect(() => {
		ctx.markCalendarVisited();
	});
</script>

{#if loadError}
	{renderLoadError}
{:else if workspacePending}
	<section class="workspace-loading" aria-busy="true" aria-live="polite" role="status">
		<div class="workspace-loading__header">
			<SkeletonLine width="136px" height="12px" />
			<SkeletonLine width="88px" height="12px" />
		</div>
		<div class="workspace-loading__summary">
			<SkeletonBlock height="96px" />
		</div>
		<SkeletonGrid rows={7} columns={7} cellWidth="minmax(0, 1fr)" cellHeight="82px" />
	</section>
{:else}
	<CalendarPageView {ctx} data={viewData} />
	{#if rangeCoordinator.loading}
		<section class="workspace-support-notice" aria-live="polite" role="status">
			<p>Loading additional calendar dates...</p>
		</section>
	{:else if rangeCoordinator.error}
		<section class="workspace-support-notice workspace-support-notice--error" aria-live="polite" role="status">
			<p>Additional calendar data is temporarily unavailable.</p>
			<button
				class="btn btn-secondary btn-sm"
				onclick={() => {
					rangeCoordinator.retryFailedRange();
				}}
			>
				Retry calendar load
			</button>
		</section>
	{/if}
{/if}

<style>
	.workspace-loading {
		display: grid;
		gap: var(--sp-4);
		padding: var(--sp-5) var(--sp-6) var(--sp-6);
	}

	.workspace-loading__header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: center;
	}

	.workspace-loading__summary {
		display: grid;
	}

	.workspace-support-notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin: 0 var(--sp-6) var(--sp-6);
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--amber) 12%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
	}

	.workspace-support-notice p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-default);
	}

	.workspace-support-notice--error {
		background: color-mix(in srgb, var(--surface-panel) 82%, var(--danger) 18%);
	}
</style>
