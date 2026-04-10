<script lang="ts">
	import { CalendarPageContext } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { CalendarPageData } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import CalendarPageView from '$features/calendar/components/CalendarPageView.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import SkeletonLine from '$lib/components/ui/SkeletonLine.svelte';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	let { data } = $props();

	const org = getOrgContext();
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

	const workspacePending = $derived(!!data.calendar?.data && calendarBootstrap === null && loadError === null);
	const pageData = $derived.by(
		(): CalendarPageData => ({
			orgId: data.orgId,
			orgName: data.orgName ?? 'Troop to Task',
			userId: data.userId,
			userPreferences: data.userPreferences,
			calendar: calendarBootstrap ? { data: calendarBootstrap.data } : undefined,
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
</style>
