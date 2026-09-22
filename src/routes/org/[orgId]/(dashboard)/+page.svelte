<script lang="ts">
	import DashboardPageView from '$features/dashboard/components/DashboardPageView.svelte';
	import type { DashboardPageData } from '$features/dashboard/dashboard.types';
	import { createDashboardScreenModel } from '$features/dashboard/read-model/dashboardScreenModel.svelte';
	import type { PageData } from './$types';
	import type { DashboardPageSummaryData } from './+page.server';
	import type { DashboardWorkspaceResult } from '$features/dashboard/server/dashboardWorkspaceBootstrap';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	type DashboardRouteData = Omit<PageData, 'summary'> & {
		summary?: DashboardPageSummaryData | Promise<DashboardPageSummaryData>;
	};

	let { data }: { data: DashboardRouteData } = $props();

	let dashboardBootstrap = $state<DashboardWorkspaceResult | null>(null);
	let summaryData = $state<DashboardPageSummaryData | null>(null);
	let workspaceError = $state<Error | null>(null);
	let summaryError = $state<Error | null>(null);
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const renderLoadError = $derived.by(() => {
		const error = workspaceError ?? summaryError;
		if (error) {
			throwRenderError(error, 'Failed to load dashboard workspace');
		}
		return null;
	});

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
	const hasAutoShownWhatsNew = { value: false };

	$effect(() => {
		ctx?.autoShowWhatsNew(hasAutoShownWhatsNew);
	});
</script>

{#if loadError}
	{renderLoadError}
{:else if pending}
	<section class="workspace-loading" aria-busy="true" aria-live="polite" role="status">
		<div class="workspace-loading__hero">
			<div class="workspace-loading__copy">
				<Skeleton class="h-3 w-[92px]" />
				<Skeleton class="h-14 w-full" />
				<Skeleton class="h-[18px] w-[78%]" />
				<Skeleton class="h-[18px] w-[62%]" />
			</div>
			<Skeleton class="h-[88px] w-[136px]" />
		</div>
		<div class="workspace-loading__grid">
			<Skeleton class="h-[200px] w-full" />
			<Skeleton class="h-[200px] w-full" />
			<Skeleton class="h-[240px] w-full" />
			<Skeleton class="h-[240px] w-full" />
		</div>
	</section>
{:else if ctx}
	<DashboardPageView {ctx} />
{/if}

<style>
	.workspace-loading {
		display: grid;
		gap: 1rem;
		padding: 1rem;
	}

	.workspace-loading__hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: stretch;
	}

	.workspace-loading__copy {
		display: grid;
		gap: 0.75rem;
	}

	.workspace-loading__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	@media (max-width: 720px) {
		.workspace-loading__hero,
		.workspace-loading__grid {
			grid-template-columns: 1fr;
		}
	}
</style>
