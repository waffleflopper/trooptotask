<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import { DASHBOARD_SECTIONS, DashboardPageView, createDashboardScreenModel } from '$features/dashboard';
	import type { DashboardPageData } from '$features/dashboard/contracts';
	import type { PageData } from './$types';
	import type { DashboardPageSummaryData } from '$features/dashboard/contracts';
	import type { DashboardWorkspaceResult } from '$features/dashboard/contracts';
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
			viewerDay: data.viewerDay,
			disabledFeatures: shell?.org.disabledFeatures ?? [],
			dashboard,
			trainingSummary: summary.trainingSummary,
			ictlSummary: summary.ictlSummary,
			onboardingTrainingCompletions: summary.onboardingTrainingCompletions
		};
	}

	const loadError = $derived(workspaceError ?? summaryError);
	const ctx = $derived(
		dashboardBootstrap && summaryData
			? createDashboardScreenModel(toDashboardPageData(data, dashboardBootstrap, summaryData), {
					sections: DASHBOARD_SECTIONS
				})
			: null
	);

	const shellUI = getAppShellContext();

	$effect(() => {
		if (ctx) shellUI.autoShowWhatsNew();
	});
</script>

{#snippet loadFailure()}
	<WorkspaceLoadError subject="Dashboard" />
{/snippet}

{#if data.dashboard?.data}
	<DashboardPageView
		orgName={data.shell.org.name}
		viewerDay={data.viewerDay}
		{ctx}
		failure={loadError ? loadFailure : undefined}
	/>
{/if}
