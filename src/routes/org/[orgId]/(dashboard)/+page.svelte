<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import {
		DASHBOARD_SECTIONS,
		DashboardPageView,
		DashboardAdminAttentionSource,
		DashboardTaskingsSource,
		createDashboardAccess,
		createDashboardScreenModel,
		overlayDashboardRecords,
		overlayDashboardSummary,
		putDashboardRecord,
		retireTrainingCompletions,
		type DashboardPageUpdates,
		type DashboardRecordOverlay
	} from '$features/dashboard';
	import {
		type DashboardPageData,
		type DashboardPageSummaryData,
		type DashboardWorkspaceResult
	} from '$features/dashboard/contracts';
	import type { PageData } from './$types';
	import { isPromiseLike, normalizeDeferredError, observeDeferred } from '$lib/utils/streamedRouteData';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	type DashboardRouteData = Omit<PageData, 'summary'> & {
		summary?: DashboardPageSummaryData | Promise<DashboardPageSummaryData>;
	};

	let { data }: { data: DashboardRouteData } = $props();

	let dashboardBootstrap = $state<DashboardWorkspaceResult | null>(null);
	let latestSummary = $state<{ orgId: string; request: number; summary: DashboardPageSummaryData } | null>(null);
	let recordOverlay = $state.raw<DashboardRecordOverlay | null>(null);
	let summaryError = $state<Error | null>(null);
	const taskingsSource = new DashboardTaskingsSource();
	const adminAttentionSource = new DashboardAdminAttentionSource();
	let summaryRequest = 0;
	let saveNumber = 0;
	onDestroy(() => {
		summaryRequest++;
	});
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const orgId = $derived(data.shell.org.id);
	const streamedWorkspace = $derived(data.dashboard?.data);
	const streamedSummary = $derived(data.summary);
	const summaryData = $derived.by(() => {
		const latest = latestSummary;
		return latest && latest.orgId === orgId ? latest.summary : null;
	});

	$effect(() => {
		let cancelled = false;
		const streamedDashboard = streamedWorkspace;

		dashboardBootstrap = null;

		if (!streamedDashboard) {
			return;
		}

		if (!isPromiseLike(streamedDashboard)) {
			dashboardBootstrap = streamedDashboard as DashboardWorkspaceResult;
			return;
		}

		// The layout shows a failed workspace; observing it here only settles the rejection.
		void observeDeferred(streamedDashboard, {
			fallbackMessage: 'Failed to load dashboard workspace',
			onResolve: (dashboard) => {
				dashboardBootstrap = dashboard;
			},
			isCancelled: () => cancelled
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => taskingsSource.track(data.taskings, orgId));
	$effect(() => adminAttentionSource.track(data.adminAttention, orgId));

	$effect(() => {
		let cancelled = false;
		const summaryOrgId = orgId;
		const streamed = streamedSummary;
		const request = ++summaryRequest;

		summaryError = null;

		if (!streamed) {
			return;
		}

		if (!isPromiseLike(streamed)) {
			latestSummary = { orgId: summaryOrgId, request, summary: streamed };
			return;
		}

		void observeDeferred(streamed, {
			fallbackMessage: 'Failed to load dashboard summary',
			onResolve: (summary) => {
				latestSummary = { orgId: summaryOrgId, request, summary };
			},
			onReject: (error) => {
				if (latestSummary?.orgId !== summaryOrgId) summaryError = error;
			},
			// A refresh that is still pending or has failed must not drop this stream; one that landed has newer numbers.
			isCancelled: () => cancelled || (latestSummary?.request ?? 0) > request
		});

		return () => {
			cancelled = true;
			summaryRequest++;
		};
	});

	function toDashboardPageData(
		data: DashboardRouteData,
		dashboard: DashboardWorkspaceResult,
		summary: DashboardPageSummaryData | null
	): DashboardPageData {
		const projectedSummary = summary && overlayDashboardSummary(summary, dashboard, recordOverlay);
		return {
			...data,
			orgId: data.shell.org.id,
			orgName: data.shell.org.name,
			userId: shell?.user.id ?? null,
			userRole: shell?.member.role,
			viewerDay: data.viewerDay,
			disabledFeatures: shell?.org.disabledFeatures ?? [],
			dashboard: overlayDashboardRecords(dashboard, recordOverlay),
			trainingSummary: projectedSummary?.trainingSummary ?? null,
			ictlSummary: projectedSummary?.ictlSummary ?? null,
			onboardingTrainingCompletions: projectedSummary?.onboardingTrainingCompletions ?? [],
			summaryFailed: summary === null,
			taskings: shell?.org.disabledFeatures.includes('eventsAndTaskings')
				? { status: 'off' }
				: taskingsSource.stateFor(orgId),
			adminAttention: adminAttentionSource.stateFor(orgId)
		};
	}

	// A failed summary still opens the page; the columns it feeds say they could not load.
	const ctx = $derived(
		dashboardBootstrap && (summaryData || summaryError)
			? createDashboardScreenModel(toDashboardPageData(data, dashboardBootstrap, summaryData))
			: null
	);

	async function refreshSummary() {
		const savedIn = orgId;
		const workspace = streamedWorkspace;
		const request = ++summaryRequest;
		const savedBefore = saveNumber;
		const current = () => request === summaryRequest && savedIn === orgId && workspace === streamedWorkspace;
		try {
			const response = await fetch(`/org/${savedIn}/api/dashboard/summary`, { cache: 'no-store' });
			if (!response.ok) throw new Error(`Dashboard summary refresh returned ${response.status}`);
			const summary: DashboardPageSummaryData = await response.json();
			if (!current()) return;
			latestSummary = { orgId: savedIn, request, summary };
			recordOverlay = retireTrainingCompletions(recordOverlay, savedBefore);
		} catch (error) {
			// The last numbers outlive a failed refresh; with none yet, the columns say they could not load.
			if (current() && latestSummary?.orgId !== savedIn)
				summaryError = normalizeDeferredError(error, 'Failed to refresh dashboard summary');
		}
	}

	const shellUI = getAppShellContext();
	const access = createDashboardAccess(shellUI);
	const updates: DashboardPageUpdates = {
		refreshSummary: () => void refreshSummary(),
		refreshTaskings: () => {
			const savedIn = orgId;
			return taskingsSource.refresh(savedIn, data.viewerDay.date, () => savedIn === orgId);
		},
		retryTaskings: () => {
			const retriedIn = orgId;
			void taskingsSource.retry(retriedIn, data.viewerDay.date, () => retriedIn === orgId);
		},
		retryAdminAttention: () => {
			const retriedIn = orgId;
			void adminAttentionSource.retry(retriedIn, data.viewerDay.date, () => retriedIn === orgId);
		},
		putRecord: (savedIn, change) => {
			if (dashboardBootstrap && savedIn === orgId)
				recordOverlay = putDashboardRecord(recordOverlay, dashboardBootstrap, change, ++saveNumber);
		}
	};

	// What's New waits for the setup decision so a visit never stacks two dialogs.
	let setupPrompted = $state<boolean | null>(null);
	$effect(() => {
		if (ctx && (!data.organizationSetup || setupPrompted === false)) shellUI.autoShowWhatsNew();
	});
</script>

{#snippet loadFailure()}
	<WorkspaceLoadError subject="Dashboard" />
{/snippet}

{#if data.dashboard?.data}
	<DashboardPageView
		orgSegment={page.params.orgId}
		orgName={data.shell.org.name}
		viewerDay={data.viewerDay}
		{ctx}
		{access}
		{updates}
		sections={DASHBOARD_SECTIONS}
		summaryFailure={loadFailure}
	/>
{/if}
{#if data.organizationSetup}
	{#await import('$features/organization') then { SetupEntryPrompt }}
		<SetupEntryPrompt
			{orgId}
			orgUrlSegment={data.shell.org.urlSegment}
			orgName={data.shell.org.name}
			entry={data.organizationSetup}
			invitationProgress={data.setupInvitationProgress}
			onDecide={(prompted) => (setupPrompted = prompted)}
		/>
	{/await}
{/if}
