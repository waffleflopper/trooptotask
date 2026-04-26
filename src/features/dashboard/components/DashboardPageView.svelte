<script lang="ts">
	import { onMount } from 'svelte';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import { ToolbarMetaItem } from '$lib/components/ui/toolbar';
	import DashboardTabs from './DashboardTabs.svelte';
	import UnitReadinessTab from './tabs/UnitReadinessTab.svelte';
	import PeopleDutyTab from './tabs/PeopleDutyTab.svelte';
	import TrainingEvalsTab from './tabs/TrainingEvalsTab.svelte';
	import { dashboardTabStore } from '../stores/dashboardTabStore.svelte';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';

	let { ctx }: { ctx: DashboardContext } = $props();

	onMount(() => {
		dashboardTabStore.init(ctx.data.orgId);
	});
</script>

<svelte:head>
	<title>{ctx.data.orgName} — Dashboard — Troop to Task</title>
</svelte:head>

<div class="dashboard-page">
	<div class="dashboard-toolbar">
		<FloatingPageToolbar ariaLabel="Dashboard controls" collapse="narrow" leadingMin="0">
			{#snippet leading()}
				<DashboardTabs orgId={ctx.data.orgId} permissions={ctx.data.permissions} />
			{/snippet}

			<div class="dashboard-toolbar__meta">
				<ToolbarMetaItem label={ctx.todayDisplay} />
			</div>
		</FloatingPageToolbar>
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
		{:else}
			<!-- Mobile pill switcher + quick actions render inside tab components -->
			{#if dashboardTabStore.activeTab === 'unit-readiness'}
				<UnitReadinessTab {ctx} />
			{:else if dashboardTabStore.activeTab === 'people-duty'}
				<PeopleDutyTab {ctx} />
			{:else if dashboardTabStore.activeTab === 'training-evals'}
				<TrainingEvalsTab {ctx} />
			{/if}
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

	.dashboard-toolbar__meta {
		display: contents;
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

	@media (max-width: 600px) {
		.dashboard-toolbar__meta {
			display: none;
		}
	}
</style>
