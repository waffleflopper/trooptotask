<script lang="ts">
	import { onMount } from 'svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import DashboardTabs from './DashboardTabs.svelte';
	import UnitReadinessTab from './tabs/UnitReadinessTab.svelte';
	import PeopleDutyTab from './tabs/PeopleDutyTab.svelte';
	import TrainingEvalsTab from './tabs/TrainingEvalsTab.svelte';
	import { dashboardTabStore } from '../stores/dashboardTabStore.svelte';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';
	import { getDashboardToolbarActions } from '../utils/dashboardToolbarActions';

	let { ctx }: { ctx: DashboardContext } = $props();

	onMount(() => {
		dashboardTabStore.init(ctx.data.orgId);
	});

	const dashboardToolbarActions = $derived<WorkspaceToolbarAction[]>(
		getDashboardToolbarActions(ctx.data.orgId, ctx.data.permissions, dashboardTabStore.activeTab)
	);
</script>

<svelte:head>
	<title>{ctx.data.orgName} — Dashboard — Troop to Task</title>
</svelte:head>

<div class="dashboard-page">
	<div class="dashboard-toolbar">
		<WorkspaceToolbar.Root ariaLabel="Dashboard controls">
			<WorkspaceToolbar.Group label="Dashboard sections">
				<DashboardTabs orgId={ctx.data.orgId} />
			</WorkspaceToolbar.Group>

			{#if dashboardToolbarActions.length > 0}
				<WorkspaceToolbar.Group label="Dashboard quick actions" zone="actions">
					<WorkspaceToolbar.Actions
						actions={dashboardToolbarActions}
						ariaLabel="Dashboard quick actions"
						overflowAriaLabel="More dashboard actions"
					/>
				</WorkspaceToolbar.Group>
			{/if}
		</WorkspaceToolbar.Root>
	</div>

	<main class="dashboard-canvas page-scroll" id="main-content">
		{#if ctx.isHydrating || dashboardTabStore.loading}
			<div class="dashboard-skeleton" aria-busy="true" aria-live="polite" role="status">
				<div class="skeleton-row skeleton-row--3">
					<SkeletonBlock height="160px" />
					<SkeletonBlock height="160px" />
					<SkeletonBlock height="160px" />
				</div>
				<div class="skeleton-row skeleton-row--2">
					<SkeletonBlock height="220px" />
					<SkeletonBlock height="220px" />
				</div>
			</div>
		{:else if dashboardTabStore.activeTab === 'unit-readiness'}
			<UnitReadinessTab {ctx} />
		{:else if dashboardTabStore.activeTab === 'people-duty'}
			<PeopleDutyTab {ctx} />
		{:else if dashboardTabStore.activeTab === 'training-evals'}
			<TrainingEvalsTab {ctx} />
		{/if}
	</main>
</div>

<style>
	.dashboard-page {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.dashboard-canvas {
		flex: 1;
		overflow-y: auto;
	}

	.dashboard-toolbar {
		padding: var(--sp-4) var(--sp-6) 0;
	}

	/* Loading skeleton */
	.dashboard-skeleton {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
	}

	.skeleton-row {
		display: grid;
		gap: var(--sp-3);
	}

	.skeleton-row--2 {
		grid-template-columns: 1fr 1fr;
	}

	.skeleton-row--3 {
		grid-template-columns: 1fr 1fr 1fr;
	}

	@media (max-width: 720px) {
		.dashboard-toolbar {
			padding: var(--sp-3) var(--sp-3) 0;
		}

		.skeleton-row--3 {
			grid-template-columns: 1fr;
		}

		.skeleton-row--2 {
			grid-template-columns: 1fr;
		}
	}
</style>
