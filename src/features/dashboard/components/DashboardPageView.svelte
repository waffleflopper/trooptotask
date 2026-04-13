<script lang="ts">
	import { onMount } from 'svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
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
	<PageToolbar title={ctx.data.orgName}>
		{#snippet leading()}
			<div class="toolbar-leading">
				<div class="toolbar-org">
					<span class="toolbar-org-kicker">Dashboard</span>
					<h1 class="toolbar-org-name">{ctx.data.orgName}</h1>
				</div>
				<span class="toolbar-date">{ctx.todayDisplay}</span>
			</div>
		{/snippet}

		{#snippet below()}
			<DashboardTabs orgId={ctx.data.orgId} permissions={ctx.data.permissions} />
		{/snippet}
	</PageToolbar>

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

	/* Toolbar leading area */
	.toolbar-leading {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
	}

	.toolbar-org {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.toolbar-org-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--ink-35);
		line-height: 1;
	}

	.toolbar-org-name {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-display);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--ink);
		margin: 0;
		line-height: 1.1;
	}

	.toolbar-date {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		padding-left: var(--sp-4);
		border-left: var(--border-thin);
	}

	@media (max-width: 720px) {
		.skeleton-row--3 {
			grid-template-columns: 1fr;
		}

		.skeleton-row--2 {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 600px) {
		.toolbar-date {
			display: none;
		}
	}
</style>
