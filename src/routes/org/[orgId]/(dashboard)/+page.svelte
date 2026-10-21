<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { getAppShellContext } from '$features/app-shell';
	import {
		DASHBOARD_SECTIONS,
		DashboardPageView,
		createDashboardAccess,
		createDashboardScreenModel,
		overlayDashboardRecords,
		overlayDashboardSummary,
		putDashboardRecord,
		putDashboardSummaryChange,
		type DashboardPageUpdates,
		type DashboardRecordOverlay,
		type DashboardSummaryOverlay
	} from '$features/dashboard';
	import {
		DASHBOARD_SUMMARY_DEPENDENCY,
		type DashboardPageData,
		type DashboardPageSummaryData,
		type DashboardWorkspaceResult
	} from '$features/dashboard/contracts';
	import type { PageData } from './$types';
	import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	type DashboardRouteData = Omit<PageData, 'summary'> & {
		summary?: DashboardPageSummaryData | Promise<DashboardPageSummaryData>;
	};

	let { data }: { data: DashboardRouteData } = $props();

	let dashboardBootstrap = $state<DashboardWorkspaceResult | null>(null);
	let latestSummary = $state<{ orgId: string; summary: DashboardPageSummaryData } | null>(null);
	let recordOverlay = $state.raw<DashboardRecordOverlay | null>(null);
	let summaryOverlay = $state.raw<DashboardSummaryOverlay | null>(null);
	let workspaceError = $state<Error | null>(null);
	let summaryError = $state<Error | null>(null);
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const orgId = $derived(data.shell.org.id);
	// Deriving the streamed values keeps a summary-only rerun from restarting the workspace read.
	const streamedWorkspace = $derived(data.dashboard?.data);
	const streamedSummary = $derived(data.summary);
	// A background refresh keeps showing the last summary of the same Organization.
	const summaryData = $derived.by(() => {
		const latest = latestSummary;
		return latest && latest.orgId === orgId ? latest.summary : null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedDashboard = streamedWorkspace;

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
		const summaryOrgId = orgId;
		const streamed = streamedSummary;

		summaryError = null;

		if (!streamed) {
			return;
		}

		if (!isPromiseLike(streamed)) {
			latestSummary = { orgId: summaryOrgId, summary: streamed };
			return;
		}

		void observeDeferred(streamed, {
			fallbackMessage: 'Failed to load dashboard summary',
			onResolve: (summary) => {
				latestSummary = { orgId: summaryOrgId, summary };
			},
			onReject: (error) => {
				// A failed background refresh keeps the last values without an error.
				if (latestSummary?.orgId !== summaryOrgId) summaryError = error;
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
			dashboard: overlayDashboardRecords(dashboard, recordOverlay),
			...overlayDashboardSummary(summary, summaryOverlay)
		};
	}

	const loadError = $derived(workspaceError ?? summaryError);
	const ctx = $derived(
		dashboardBootstrap && summaryData
			? createDashboardScreenModel(toDashboardPageData(data, dashboardBootstrap, summaryData))
			: null
	);

	const shellUI = getAppShellContext();
	const access = createDashboardAccess(shellUI);
	const updates: DashboardPageUpdates = {
		refreshSummary: (meanwhile) => {
			if (meanwhile && summaryData && meanwhile.orgId === orgId)
				summaryOverlay = putDashboardSummaryChange(summaryOverlay, summaryData, meanwhile.change);
			void invalidate(DASHBOARD_SUMMARY_DEPENDENCY);
		},
		putRecord: (savedIn, change) => {
			if (dashboardBootstrap && savedIn === orgId)
				recordOverlay = putDashboardRecord(recordOverlay, dashboardBootstrap, change);
		}
	};

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
		{access}
		{updates}
		sections={DASHBOARD_SECTIONS}
		failure={loadError ? loadFailure : undefined}
	/>
{/if}
