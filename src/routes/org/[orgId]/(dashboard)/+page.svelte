<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import { DashboardPageView, createDashboardScreenModel } from '$features/dashboard';
	import type { DashboardPageData } from '$features/dashboard/contracts';
	import type { PageData } from './$types';
	import type { DashboardPageSummaryData } from '$features/dashboard/contracts';
	import type { DashboardWorkspaceResult } from '$features/dashboard/contracts';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	type DashboardRouteData = Omit<PageData, 'summary'> & {
		summary?: DashboardPageSummaryData | Promise<DashboardPageSummaryData>;
	};

	let { data }: { data: DashboardRouteData } = $props();

	let dashboardBootstrap = $state<DashboardWorkspaceResult | null>(null);
	let summaryData = $state<DashboardPageSummaryData | null>(null);
	let workspaceError = $state<Error | null>(null);
	let summaryError = $state<Error | null>(null);
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);

	$effect(() => {
		let cancelled = false;
		const streamedDashboard = data.dashboard?.data;

		dashboardBootstrap = null;
		workspaceError = null;

		if (!streamedDashboard) {
			return;
		}

		if (!isPromiseLike(streamedDashboard)) {
			dashboardBootstrap = streamedDashboard as DashboardWorkspaceResult;
			return;
		}

		void observeDeferred(streamedDashboard, {
			fallbackMessage: 'Failed to load dashboard workspace',
			onResolve: (dashboard) => {
				dashboardBootstrap = dashboard;
			},
			onReject: (error) => {
				workspaceError = error;
			},
			isCancelled: () => cancelled
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		let cancelled = false;

		summaryData = null;
		summaryError = null;

		if (!data.summary) {
			return;
		}

		if (!isPromiseLike(data.summary)) {
			summaryData = data.summary;
			return;
		}

		void observeDeferred(data.summary, {
			fallbackMessage: 'Failed to load dashboard summary',
			onResolve: (summary) => {
				summaryData = summary;
			},
			onReject: (error) => {
				summaryError = error;
			},
			isCancelled: () => cancelled
		});

		return () => {
			cancelled = true;
		};
	});

	function toDashboardPageData(
		data: DashboardRouteData,
		dashboard: DashboardWorkspaceResult,
		summary: DashboardPageSummaryData
	): DashboardPageData {
		return {
			...data,
			orgId: data.shell.org.id,
			orgName: data.shell.org.name,
			userId: shell?.user.id ?? null,
			userRole: shell?.member.role,
			disabledFeatures: shell?.org.disabledFeatures ?? [],
			dashboard,
			trainingSummary: summary.trainingSummary,
			ictlSummary: summary.ictlSummary,
			onboardingTrainingCompletions: summary.onboardingTrainingCompletions
		};
	}

	const loadError = $derived(workspaceError ?? summaryError);
	const workspacePending = $derived(!!data.dashboard?.data && dashboardBootstrap === null && workspaceError === null);
	const summaryPending = $derived(!!data.summary && summaryData === null && summaryError === null);
	const pending = $derived(workspacePending || summaryPending);
	const ctx = $derived(
		dashboardBootstrap && summaryData
			? createDashboardScreenModel(toDashboardPageData(data, dashboardBootstrap, summaryData))
			: null
	);

	// Track whether we've auto-shown What's New (must persist across re-renders)
	const shellUI = getAppShellContext();

	$effect(() => {
		if (ctx) shellUI.autoShowWhatsNew();
	});
</script>

{#if loadError}
	<WorkspaceLoadError subject="Dashboard" />
{:else if pending}
	<section class="grid gap-4 p-4" aria-live="polite" role="status">
		<div class="grid grid-cols-1 items-stretch gap-4 min-[721px]:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-3">
				<Skeleton class="h-3 w-[92px]" />
				<Skeleton class="h-14 w-full" />
				<Skeleton class="h-[18px] w-[78%]" />
				<Skeleton class="h-[18px] w-[62%]" />
			</div>
			<Skeleton class="h-[88px] w-[136px]" />
		</div>
		<div class="grid grid-cols-1 gap-4 min-[721px]:grid-cols-2">
			<Skeleton class="h-[200px] w-full" />
			<Skeleton class="h-[200px] w-full" />
			<Skeleton class="h-[240px] w-full" />
			<Skeleton class="h-[240px] w-full" />
		</div>
	</section>
{:else if ctx}
	<DashboardPageView {ctx} />
{/if}
