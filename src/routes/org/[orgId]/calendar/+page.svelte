<script lang="ts">
	import { untrack } from 'svelte';
	import { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { CalendarPageData } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { calendarStore } from '$features/calendar/stores/calendar.svelte';
	import {
		createVisibleCalendarRange,
		getCalendarRangeGaps,
		type CalendarBufferedRange
	} from '$features/calendar/utils/calendarRange';
	import { loadCalendarRange, mergeCalendarRangeIntoStores } from '$features/calendar/utils/calendarRangeLoader';
	import { mergeById } from '$features/calendar/utils/mergeById';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import SkeletonLine from '$lib/components/ui/SkeletonLine.svelte';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	let { data } = $props();

	const org = getOrgContext();
	let calendarBootstrap = $state<WorkspaceBootstrap<CalendarBootstrap> | null>(null);
	let loadError = $state<Error | null>(null);
	let rangeError = $state<Error | null>(null);
	let rangeLoading = $state(false);
	let loadedRange = $state<CalendarBufferedRange | null>(null);
	let mergedAdvancedDutyEvents = $state<CalendarBootstrap['advancedDutyEvents']>([]);
	let pendingRangeKey = $state<string | null>(null);
	let failedRangeKey = $state<string | null>(null);
	let rangeRetryNonce = $state(0);
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
			loadedRange = null;
			mergedAdvancedDutyEvents = [];
			pendingRangeKey = null;
			failedRangeKey = null;
			rangeLoading = false;
			return;
		}

		if (bootstrap.rangeStart && bootstrap.rangeEnd) {
			const currentLoadedRange = untrack(() => loadedRange);
			loadedRange = currentLoadedRange
				? {
						rangeStart:
							bootstrap.rangeStart < currentLoadedRange.rangeStart
								? bootstrap.rangeStart
								: currentLoadedRange.rangeStart,
						rangeEnd:
							bootstrap.rangeEnd > currentLoadedRange.rangeEnd ? bootstrap.rangeEnd : currentLoadedRange.rangeEnd
					}
				: {
						rangeStart: bootstrap.rangeStart,
						rangeEnd: bootstrap.rangeEnd
					};
		}

		mergedAdvancedDutyEvents = mergeById(
			untrack(() => mergedAdvancedDutyEvents),
			bootstrap.advancedDutyEvents ?? []
		);
	});

	$effect(() => {
		let cancelled = false;
		const bootstrap = calendarBootstrap?.data;

		if (!bootstrap || !loadedRange || !(data.permissions?.canViewCalendar ?? false)) {
			return;
		}

		const nextRanges = getCalendarRangeGaps(
			loadedRange,
			createVisibleCalendarRange(calendarStore.currentDate, ctx.viewMode)
		);

		if (nextRanges.length === 0) {
			pendingRangeKey = null;
			failedRangeKey = null;
			rangeLoading = false;
			rangeError = null;
			return;
		}

		const requestKey = nextRanges.map((range) => `${range.rangeStart}:${range.rangeEnd}`).join('|');
		if (untrack(() => pendingRangeKey) === requestKey) {
			return;
		}
		if (untrack(() => failedRangeKey) === requestKey) {
			return;
		}

		rangeRetryNonce;

		rangeLoading = true;
		rangeError = null;
		pendingRangeKey = requestKey;

		void Promise.all(nextRanges.map((range) => loadCalendarRange(data.orgId, range)))
			.then((rangeDataSets) => {
				if (cancelled) return;
				let nextLoadedRange = untrack(() => loadedRange);
				let nextDutyEvents = untrack(() => mergedAdvancedDutyEvents);

				for (const rangeData of rangeDataSets) {
					mergeCalendarRangeIntoStores(data.orgId, rangeData);
					nextDutyEvents = mergeById(nextDutyEvents, rangeData.advancedDutyEvents);
					nextLoadedRange = nextLoadedRange
						? {
								rangeStart:
									rangeData.rangeStart < nextLoadedRange.rangeStart ? rangeData.rangeStart : nextLoadedRange.rangeStart,
								rangeEnd: rangeData.rangeEnd > nextLoadedRange.rangeEnd ? rangeData.rangeEnd : nextLoadedRange.rangeEnd
							}
						: {
								rangeStart: rangeData.rangeStart,
								rangeEnd: rangeData.rangeEnd
							};
				}

				mergedAdvancedDutyEvents = nextDutyEvents;
				loadedRange = nextLoadedRange;
				rangeLoading = false;
				failedRangeKey = null;
				pendingRangeKey = null;
			})
			.catch((error) => {
				if (cancelled) return;
				rangeError = error instanceof Error ? error : new Error('Failed to load calendar range');
				rangeLoading = false;
				failedRangeKey = requestKey;
				pendingRangeKey = null;
			});

		return () => {
			cancelled = true;
		};
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
							...calendarBootstrap.data,
							rangeStart: loadedRange?.rangeStart ?? calendarBootstrap.data.rangeStart,
							rangeEnd: loadedRange?.rangeEnd ?? calendarBootstrap.data.rangeEnd,
							advancedDutyEvents: mergedAdvancedDutyEvents
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
	{#if rangeLoading}
		<section class="workspace-support-notice" aria-live="polite" role="status">
			<p>Loading additional calendar dates...</p>
		</section>
	{:else if rangeError}
		<section class="workspace-support-notice workspace-support-notice--error" aria-live="polite" role="status">
			<p>Additional calendar data is temporarily unavailable.</p>
			<button
				class="btn btn-secondary btn-sm"
				onclick={() => {
					rangeError = null;
					failedRangeKey = null;
					rangeRetryNonce += 1;
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
