<script lang="ts">
	import { DashboardContext, DashboardPageView, DashboardModals } from '$features/dashboard';
	import type { DashboardPageData } from '$features/dashboard/contexts/DashboardContext.svelte';
	import type { PageData } from './$types';
	import type { DashboardPageSummaryData, DashboardPageSupportData } from './+page.server';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import SkeletonLine from '$lib/components/ui/SkeletonLine.svelte';
	import { isPromiseLike, observeDeferred, throwRenderError } from '$lib/utils/streamedRouteData';

	let {
		data
	}: {
		data: PageData & { summary?: Promise<DashboardPageSummaryData>; support?: Promise<DashboardPageSupportData> };
	} = $props();

	let dashboardBootstrap = $state<WorkspaceBootstrap<DashboardBootstrap> | null>(null);
	let summaryData = $state<DashboardPageSummaryData | null>(null);
	let supportData = $state<DashboardPageSupportData | null>(null);
	let workspaceError = $state<Error | null>(null);
	let summaryError = $state<Error | null>(null);
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
			dashboardBootstrap = streamedDashboard as WorkspaceBootstrap<DashboardBootstrap>;
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

		supportData = null;

		if (!data.support) {
			return;
		}

		if (!isPromiseLike(data.support)) {
			supportData = data.support;
			return;
		}

		void observeDeferred(data.support, {
			fallbackMessage: 'Failed to load dashboard support data',
			onResolve: (support) => {
				supportData = support;
			},
			onReject: () => {},
			isCancelled: () => cancelled
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (ctx && supportData) {
			ctx.applySupportData(supportData);
		}
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
		data: PageData,
		dashboard: WorkspaceBootstrap<DashboardBootstrap>,
		summary: DashboardPageSummaryData
	): DashboardPageData {
		return {
			...data,
			orgId: data.orgId,
			orgName: data.orgName ?? 'Troop to Task',
			userId: data.userId ?? null,
			permissions: data.permissions ?? null,
			dashboard,
			trainingSummary: summary.trainingSummary,
			onboardingTrainingCompletions: summary.onboardingTrainingCompletions
		};
	}

	const loadError = $derived(workspaceError ?? summaryError);
	const workspacePending = $derived(!!data.dashboard?.data && dashboardBootstrap === null && workspaceError === null);
	const summaryPending = $derived(!!data.summary && summaryData === null && summaryError === null);
	const pending = $derived(workspacePending || summaryPending);
	let ctx = $state<DashboardContext | null>(null);

	// Track whether we've auto-shown What's New (must persist across re-renders)
	const hasAutoShownWhatsNew = { value: false };

	$effect.pre(() => {
		ctx =
			dashboardBootstrap && summaryData
				? new DashboardContext(toDashboardPageData(data, dashboardBootstrap, summaryData))
				: null;
	});

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
				<SkeletonLine width="92px" height="12px" />
				<SkeletonBlock height="56px" />
				<SkeletonLine width="78%" height="18px" />
				<SkeletonLine width="62%" height="18px" />
			</div>
			<SkeletonBlock width="136px" height="88px" />
		</div>
		<div class="workspace-loading__grid">
			<SkeletonBlock height="200px" />
			<SkeletonBlock height="200px" />
			<SkeletonBlock height="240px" />
			<SkeletonBlock height="240px" />
		</div>
	</section>
{:else if ctx}
	<DashboardPageView {ctx} />
	<DashboardModals {ctx} />
{/if}

<style>
	.workspace-loading {
		display: grid;
		gap: var(--sp-4);
		padding: var(--sp-4);
	}

	.workspace-loading__hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--sp-4);
		align-items: stretch;
	}

	.workspace-loading__copy {
		display: grid;
		gap: var(--sp-3);
	}

	.workspace-loading__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}

	@media (max-width: 720px) {
		.workspace-loading__hero,
		.workspace-loading__grid {
			grid-template-columns: 1fr;
		}
	}
</style>
