<script lang="ts">
	import { DashboardContext, DashboardPageView } from '$features/dashboard';
	import type { DashboardSupportData } from '$features/dashboard/contexts/DashboardContext.svelte';
	import type { DashboardPageData } from '$features/dashboard/dashboard.types';
	import type { PageData } from './$types';
	import type { DashboardPageSummaryData } from './+page.server';
	import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
	import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		isPromiseLike,
		normalizeDeferredError,
		observeDeferred,
		throwRenderError
	} from '$lib/utils/streamedRouteData';

	type DashboardRouteData = Omit<PageData, 'summary'> & {
		summary?: DashboardPageSummaryData | Promise<DashboardPageSummaryData>;
	};

	let { data }: { data: DashboardRouteData } = $props();

	let dashboardBootstrap = $state<WorkspaceBootstrap<DashboardBootstrap> | null>(null);
	let summaryData = $state<DashboardPageSummaryData | null>(null);
	let supportData = $state<DashboardSupportData | null>(null);
	let supportLoading = $state(false);
	let supportError = $state<Error | null>(null);
	let supportRequestVersion = 0;
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
		if (ctx && supportData) {
			ctx.applySupportData(supportData);
		}
	});

	$effect(() => {
		data.orgId;
		supportRequestVersion += 1;
		supportData = null;
		supportLoading = false;
		supportError = null;
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
			ictlSummary: summary.ictlSummary,
			onboardingTrainingCompletions: summary.onboardingTrainingCompletions
		};
	}

	function shouldLoadWorkspaceSupport(ctx: DashboardContext): boolean {
		return ctx.userRole === 'owner' || ctx.userRole === 'admin';
	}

	async function loadSupportData(ctx: DashboardContext): Promise<void> {
		const requestVersion = ++supportRequestVersion;
		const orgId = ctx.data.orgId;
		supportLoading = true;
		supportError = null;

		try {
			const response = await fetch(`/org/${orgId}/api/getting-started`);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? 'Failed to load workspace support');
			}

			const nextSupportData = (await response.json()) as DashboardSupportData;
			if (requestVersion !== supportRequestVersion) {
				return;
			}

			supportData = nextSupportData;
		} catch (error) {
			if (requestVersion !== supportRequestVersion) {
				return;
			}

			supportError = normalizeDeferredError(error, 'Failed to load workspace support');
		} finally {
			if (requestVersion === supportRequestVersion) {
				supportLoading = false;
			}
		}
	}

	const loadError = $derived(workspaceError ?? summaryError);
	const workspacePending = $derived(!!data.dashboard?.data && dashboardBootstrap === null && workspaceError === null);
	const summaryPending = $derived(!!data.summary && summaryData === null && summaryError === null);
	const pending = $derived(workspacePending || summaryPending);
	const ctx = $derived(
		dashboardBootstrap && summaryData
			? new DashboardContext(toDashboardPageData(data, dashboardBootstrap, summaryData))
			: null
	);
	const canLoadSupport = $derived(ctx ? shouldLoadWorkspaceSupport(ctx) : false);

	// Track whether we've auto-shown What's New (must persist across re-renders)
	const hasAutoShownWhatsNew = { value: false };

	$effect(() => {
		ctx?.autoShowWhatsNew(hasAutoShownWhatsNew);
	});

	$effect(() => {
		if (!ctx || !canLoadSupport || ctx.hasSupportData || supportLoading || supportError) {
			return;
		}

		void loadSupportData(ctx);
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
	{#if canLoadSupport && supportLoading && !ctx.hasSupportData}
		<section class="workspace-support-notice" aria-live="polite" role="status">
			<p>Loading workspace support...</p>
		</section>
	{:else if canLoadSupport && supportError}
		<section class="workspace-support-notice workspace-support-notice--error" aria-live="polite" role="status">
			<p>Workspace support is temporarily unavailable.</p>
			<Button
				variant="outline"
				size="sm"
				onclick={() => {
					if (ctx) {
						void loadSupportData(ctx);
					}
				}}
			>
				Retry checklist
			</Button>
		</section>
	{/if}
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

	.workspace-support-notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0 1rem 1rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		color: var(--muted-foreground);
	}

	.workspace-support-notice p {
		margin: 0;
	}

	.workspace-support-notice--error {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, var(--card));
		color: var(--foreground);
	}

	@media (max-width: 720px) {
		.workspace-loading__hero,
		.workspace-loading__grid {
			grid-template-columns: 1fr;
		}

		.workspace-support-notice {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
