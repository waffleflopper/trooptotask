<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import UnitReadinessTab from './tabs/UnitReadinessTab.svelte';
	import PeopleDutyTab from './tabs/PeopleDutyTab.svelte';
	import TrainingEvalsTab from './tabs/TrainingEvalsTab.svelte';
	import { dashboardTabStore } from '../stores/dashboardTabStore.svelte';
	import { resolveDashboardTab } from '../dashboard.types';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';
	import { DASHBOARD_TABS, getDashboardToolbarActions } from '../utils/dashboardToolbarActions';

	let { ctx }: { ctx: DashboardContext } = $props();

	onMount(() => {
		dashboardTabStore.init(ctx.data.orgId);
	});

	const dashboardToolbarActions = $derived<WorkspaceToolbarAction[]>(
		getDashboardToolbarActions(ctx.data.orgId, ctx.data.permissions, dashboardTabStore.activeTab)
	);

	const activeTabLabel = $derived(
		DASHBOARD_TABS.find((tab) => tab.id === dashboardTabStore.activeTab)?.label ?? 'dashboard view'
	);

	function handleTabChange(value: string): void {
		dashboardTabStore.setTab(resolveDashboardTab(value));
	}
</script>

<svelte:head>
	<title>{ctx.data.orgName} — Dashboard — Troop to Task</title>
</svelte:head>

<div class="dashboard-page">
	<Tabs.Root
		value={dashboardTabStore.activeTab}
		onValueChange={handleTabChange}
		class="min-h-0 flex-1 gap-0"
		activationMode="manual"
	>
		<div class="dashboard-toolbar">
			<WorkspaceToolbar.Root ariaLabel="Dashboard controls">
				<WorkspaceToolbar.Group label="Dashboard sections">
					<Tabs.List aria-label="Dashboard views">
						{#each DASHBOARD_TABS as tab (tab.id)}
							<Tabs.Trigger value={tab.id}>{tab.label}</Tabs.Trigger>
						{/each}
					</Tabs.List>

					{#if !dashboardTabStore.isDefault}
						<Button
							variant="outline"
							size="sm"
							aria-label="Set {activeTabLabel} as default dashboard view"
							disabled={dashboardTabStore.saving}
							onclick={() => dashboardTabStore.setDefaultTab(ctx.data.orgId)}
						>
							{dashboardTabStore.saving ? 'Saving...' : 'Set as default'}
						</Button>
					{/if}
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

			{#if dashboardTabStore.error}
				<WorkspaceToolbar.Meta tone="warning" role="status">{dashboardTabStore.error}</WorkspaceToolbar.Meta>
			{/if}
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
				<Tabs.Content value="unit-readiness">
					{#if dashboardTabStore.activeTab === 'unit-readiness'}
						<UnitReadinessTab {ctx} />
					{/if}
				</Tabs.Content>
				<Tabs.Content value="people-duty">
					{#if dashboardTabStore.activeTab === 'people-duty'}
						<PeopleDutyTab {ctx} />
					{/if}
				</Tabs.Content>
				<Tabs.Content value="training-evals">
					{#if dashboardTabStore.activeTab === 'training-evals'}
						<TrainingEvalsTab {ctx} />
					{/if}
				</Tabs.Content>
			{/if}
		</main>
	</Tabs.Root>
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
